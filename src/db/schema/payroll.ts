import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";
import { employees, users } from "./core";

export const salaryStructures = sqliteTable("salary_structures", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  employeeId: integer("employee_id").notNull().references(() => employees.id),
  basic: real("basic").notNull(),
  hra: real("hra").notNull().default(0),
  effectiveFrom: text("effective_from").notNull(),
  effectiveTo: text("effective_to"),
});

export const employeeBankDetails = sqliteTable("employee_bank_details", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  employeeId: integer("employee_id").notNull().references(() => employees.id).unique(),
  accountHolderName: text("account_holder_name").notNull(),
  accountNumber: text("account_number").notNull(),
  ifsc: text("ifsc").notNull(),
  bankName: text("bank_name"),
});

export const salaryComponents = sqliteTable("salary_components", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  structureId: integer("structure_id").notNull().references(() => salaryStructures.id),
  name: text("name").notNull(),
  type: text("type", { enum: ["earning", "deduction"] }).notNull(),
  amount: real("amount").notNull(),
});

// Single active row holds the statutory rates HR can update as government rules change.
export const statutorySettings = sqliteTable("statutory_settings", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  pfEmployeePct: real("pf_employee_pct").notNull().default(12),
  pfEmployerPct: real("pf_employer_pct").notNull().default(12),
  pfWageCeiling: real("pf_wage_ceiling").notNull().default(15000),
  esiEmployeePct: real("esi_employee_pct").notNull().default(0.75),
  esiEmployerPct: real("esi_employer_pct").notNull().default(3.25),
  esiWageCeiling: real("esi_wage_ceiling").notNull().default(21000),
  professionalTaxSlabsJson: text("professional_tax_slabs_json").notNull().default("[]"),
  effectiveFrom: text("effective_from").notNull().default(sql`(current_timestamp)`),
});

export const payrollRuns = sqliteTable("payroll_runs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  month: integer("month").notNull(),
  year: integer("year").notNull(),
  status: text("status", { enum: ["draft", "preview", "locked"] }).notNull().default("draft"),
  lockedByUserId: integer("locked_by_user_id").references(() => users.id),
  lockedAt: text("locked_at"),
  createdAt: text("created_at").notNull().default(sql`(current_timestamp)`),
});

export const payslips = sqliteTable("payslips", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  payrollRunId: integer("payroll_run_id").notNull().references(() => payrollRuns.id),
  employeeId: integer("employee_id").notNull().references(() => employees.id),
  payableDays: real("payable_days").notNull(),
  presentDays: real("present_days").notNull(),
  halfDays: real("half_days").notNull(),
  paidLeaveDays: real("paid_leave_days").notNull(),
  lopDays: real("lop_days").notNull(),
  holidayDays: real("holiday_days").notNull(),
  otHours: real("ot_hours").notNull().default(0),
  otAmount: real("ot_amount").notNull().default(0),
  grossEarnings: real("gross_earnings").notNull(),
  pfEmployee: real("pf_employee").notNull().default(0),
  pfEmployer: real("pf_employer").notNull().default(0),
  esiEmployee: real("esi_employee").notNull().default(0),
  esiEmployer: real("esi_employer").notNull().default(0),
  professionalTax: real("professional_tax").notNull().default(0),
  tds: real("tds").notNull().default(0),
  advancesDeduction: real("advances_deduction").notNull().default(0),
  arrearsAmount: real("arrears_amount").notNull().default(0),
  netPay: real("net_pay").notNull(),
  generatedAt: text("generated_at").notNull().default(sql`(current_timestamp)`),
});

export const payslipLines = sqliteTable("payslip_lines", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  payslipId: integer("payslip_id").notNull().references(() => payslips.id),
  componentName: text("component_name").notNull(),
  type: text("type", { enum: ["earning", "deduction"] }).notNull(),
  amount: real("amount").notNull(),
});

// A correction on a locked month never edits that month; it becomes an arrear on a future run.
export const arrears = sqliteTable("arrears", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  employeeId: integer("employee_id").notNull().references(() => employees.id),
  originPayrollRunId: integer("origin_payroll_run_id").notNull().references(() => payrollRuns.id),
  amount: real("amount").notNull(),
  reason: text("reason").notNull(),
  appliedPayrollRunId: integer("applied_payroll_run_id").references(() => payrollRuns.id),
  createdByUserId: integer("created_by_user_id").notNull().references(() => users.id),
  createdAt: text("created_at").notNull().default(sql`(current_timestamp)`),
});

export const bankFiles = sqliteTable("bank_files", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  payrollRunId: integer("payroll_run_id").notNull().references(() => payrollRuns.id),
  generatedAt: text("generated_at").notNull().default(sql`(current_timestamp)`),
  content: text("content").notNull(),
});

export const holidays = sqliteTable("holidays", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  date: text("date").notNull().unique(),
  name: text("name").notNull(),
});

// Single active row — company letterhead details for the payslip PDF (name/address/PAN/logo).
export const companySettings = sqliteTable("company_settings", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  addressLine1: text("address_line1"),
  addressLine2: text("address_line2"),
  panNumber: text("pan_number"),
  logoBase64: text("logo_base64"),
  signatoryLabel: text("signatory_label").notNull().default("Authorized Signatory"),
});

// Statutory identifiers that appear on a payslip but rarely change — set once per employee.
export const employeePayrollDetails = sqliteTable("employee_payroll_details", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  employeeId: integer("employee_id").notNull().references(() => employees.id).unique(),
  panNumber: text("pan_number"),
  uanNumber: text("uan_number"),
  pfAccountNumber: text("pf_account_number"),
  esiNumber: text("esi_number"),
  pranNumber: text("pran_number"),
  taxRegime: text("tax_regime"),
  function: text("function"),
  location: text("location"),
});

// The per-run, per-employee inputs that actually change month to month (loan installment, TDS).
// Kept separate from `payslips` so they survive a preview recompute instead of being wiped with it.
export const payrollManualEntries = sqliteTable("payroll_manual_entries", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  payrollRunId: integer("payroll_run_id").notNull().references(() => payrollRuns.id),
  employeeId: integer("employee_id").notNull().references(() => employees.id),
  loan: real("loan").notNull().default(0),
  tds: real("tds").notNull().default(0),
  updatedByUserId: integer("updated_by_user_id").notNull().references(() => users.id),
  updatedAt: text("updated_at").notNull().default(sql`(current_timestamp)`),
});
