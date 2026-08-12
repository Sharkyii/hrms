import { Hono } from "hono";
import { and, eq } from "drizzle-orm";
import { getDb } from "../db/client";
import {
  salaryStructures,
  salaryComponents,
  statutorySettings,
  employeeBankDetails,
  holidays,
  payrollRuns,
  payslips,
  payslipLines,
  arrears,
  bankFiles,
  attendanceRecords,
  employees,
} from "../db/schema";
import { computePayableDays, computeEarnings, computeStatutory, STANDARD_WORKING_DAYS_PER_MONTH } from "../lib/payroll-engine";
import { requireAuth, requirePermission } from "../middleware/auth";
import type { Env } from "../types";

const app = new Hono<{ Bindings: Env }>();
app.use("*", requireAuth);

// --- Salary structures ---
app.post("/salary-structures", requirePermission("payroll.process"), async (c) => {
  const body = await c.req.json<{
    employeeId?: number;
    basic?: number;
    hra?: number;
    effectiveFrom?: string;
    components?: Array<{ name: string; type: "earning" | "deduction"; amount: number }>;
  }>();
  if (!body.employeeId || body.basic === undefined || !body.effectiveFrom) {
    return c.json({ error: "employeeId, basic, and effectiveFrom are required" }, 400);
  }
  const db = getDb(c.env.DB);
  const created = await db
    .insert(salaryStructures)
    .values({ employeeId: body.employeeId, basic: body.basic, hra: body.hra ?? 0, effectiveFrom: body.effectiveFrom })
    .returning()
    .get();

  for (const comp of body.components ?? []) {
    await db.insert(salaryComponents).values({ structureId: created.id, name: comp.name, type: comp.type, amount: comp.amount }).run();
  }
  return c.json(created, 201);
});

app.get("/salary-structures/:employeeId", requirePermission("payroll.process"), async (c) => {
  const employeeId = Number(c.req.param("employeeId"));
  const db = getDb(c.env.DB);
  return c.json(await db.select().from(salaryStructures).where(eq(salaryStructures.employeeId, employeeId)).all());
});

// --- Statutory settings (single active row; HR/Founder update as government rates change) ---
app.get("/statutory-settings", requirePermission("payroll.process"), async (c) => {
  const db = getDb(c.env.DB);
  const rows = await db.select().from(statutorySettings).all();
  return c.json(rows.at(-1) ?? null);
});

app.put("/statutory-settings", requirePermission("payroll.process"), async (c) => {
  const body = await c.req.json<Partial<typeof statutorySettings.$inferInsert>>();
  const db = getDb(c.env.DB);
  const created = await db.insert(statutorySettings).values({ ...body, pfEmployeePct: body.pfEmployeePct ?? 12 }).returning().get();
  return c.json(created, 201);
});

// --- Bank details ---
app.put("/bank-details/:employeeId", requirePermission("payroll.process"), async (c) => {
  const employeeId = Number(c.req.param("employeeId"));
  const body = await c.req.json<{ accountHolderName?: string; accountNumber?: string; ifsc?: string; bankName?: string }>();
  if (!body.accountHolderName || !body.accountNumber || !body.ifsc) {
    return c.json({ error: "accountHolderName, accountNumber, and ifsc are required" }, 400);
  }
  const db = getDb(c.env.DB);
  const existing = await db.select().from(employeeBankDetails).where(eq(employeeBankDetails.employeeId, employeeId)).get();
  if (existing) {
    const updated = await db
      .update(employeeBankDetails)
      .set({ accountHolderName: body.accountHolderName, accountNumber: body.accountNumber, ifsc: body.ifsc, bankName: body.bankName })
      .where(eq(employeeBankDetails.employeeId, employeeId))
      .returning()
      .get();
    return c.json(updated);
  }
  const created = await db
    .insert(employeeBankDetails)
    .values({ employeeId, accountHolderName: body.accountHolderName, accountNumber: body.accountNumber, ifsc: body.ifsc, bankName: body.bankName ?? null })
    .returning()
    .get();
  return c.json(created, 201);
});

// --- Holidays ---
app.get("/holidays", async (c) => {
  const db = getDb(c.env.DB);
  return c.json(await db.select().from(holidays).all());
});

app.post("/holidays", requirePermission("payroll.process"), async (c) => {
  const body = await c.req.json<{ date?: string; name?: string }>();
  if (!body.date || !body.name) return c.json({ error: "date and name are required" }, 400);
  const db = getDb(c.env.DB);
  const created = await db.insert(holidays).values({ date: body.date, name: body.name }).returning().get();
  return c.json(created, 201);
});

// --- Payroll runs ---
app.post("/runs", requirePermission("payroll.process"), async (c) => {
  const body = await c.req.json<{ month?: number; year?: number }>();
  if (!body.month || !body.year) return c.json({ error: "month and year are required" }, 400);
  const db = getDb(c.env.DB);
  const existing = await db.select().from(payrollRuns).where(and(eq(payrollRuns.month, body.month), eq(payrollRuns.year, body.year))).get();
  if (existing) return c.json(existing, 200);
  const created = await db.insert(payrollRuns).values({ month: body.month, year: body.year }).returning().get();
  return c.json(created, 201);
});

app.get("/runs", requirePermission("payroll.process"), async (c) => {
  const db = getDb(c.env.DB);
  return c.json(await db.select().from(payrollRuns).all());
});

// Computes payslips for every active employee for this run's month. Re-runnable while draft/preview;
// each call wipes and recomputes this run's payslips so numbers never drift from current attendance/leave data.
app.post("/runs/:id/preview", requirePermission("payroll.process"), async (c) => {
  const runId = Number(c.req.param("id"));
  const body = await c.req.json<{ manualEntries?: Array<{ employeeId: number; tds?: number; advancesDeduction?: number }> }>().catch(() => ({ manualEntries: [] }));
  const db = getDb(c.env.DB);

  const run = await db.select().from(payrollRuns).where(eq(payrollRuns.id, runId)).get();
  if (!run) return c.json({ error: "Not found" }, 404);
  if (run.status === "locked") return c.json({ error: "Run is locked" }, 409);

  const settingsRows = await db.select().from(statutorySettings).all();
  const settings = settingsRows.at(-1);
  if (!settings) return c.json({ error: "No statutory settings configured" }, 400);

  const existingPayslips = await db.select().from(payslips).where(eq(payslips.payrollRunId, runId)).all();
  for (const p of existingPayslips) {
    await db.delete(payslipLines).where(eq(payslipLines.payslipId, p.id)).run();
  }
  await db.delete(payslips).where(eq(payslips.payrollRunId, runId)).run();

  const manualByEmployee = new Map((body.manualEntries ?? []).map((e) => [e.employeeId, e]));
  const activeEmployees = await db.select().from(employees).where(eq(employees.status, "active")).all();

  const created = [];
  for (const employee of activeEmployees) {
    const payableDays = await computePayableDays(db, employee.id, run.year, run.month);
    const earnings = await computeEarnings(db, employee.id, payableDays, STANDARD_WORKING_DAYS_PER_MONTH);
    const statutory = computeStatutory(earnings.proratedBasic, earnings.grossEarnings, settings);

    const employeeArrears = await db.select().from(arrears).where(and(eq(arrears.employeeId, employee.id))).all();
    const pendingArrears = employeeArrears.filter((a) => a.appliedPayrollRunId === null);
    const arrearsAmount = pendingArrears.reduce((sum, a) => sum + a.amount, 0);

    const manual = manualByEmployee.get(employee.id);
    const tds = manual?.tds ?? 0;
    const advancesDeduction = manual?.advancesDeduction ?? 0;

    const netPay =
      earnings.grossEarnings +
      arrearsAmount -
      statutory.pfEmployee -
      statutory.esiEmployee -
      statutory.professionalTax -
      tds -
      advancesDeduction;

    const payslip = await db
      .insert(payslips)
      .values({
        payrollRunId: runId,
        employeeId: employee.id,
        payableDays: payableDays.payableDays,
        presentDays: payableDays.presentDays,
        halfDays: payableDays.halfDays,
        paidLeaveDays: payableDays.paidLeaveDays,
        lopDays: payableDays.lopDays,
        holidayDays: payableDays.holidayDays,
        otHours: payableDays.otHours,
        otAmount: earnings.otAmount,
        grossEarnings: earnings.grossEarnings,
        pfEmployee: statutory.pfEmployee,
        pfEmployer: statutory.pfEmployer,
        esiEmployee: statutory.esiEmployee,
        esiEmployer: statutory.esiEmployer,
        professionalTax: statutory.professionalTax,
        tds,
        advancesDeduction,
        arrearsAmount,
        netPay: Math.round(Math.max(0, netPay) * 100) / 100,
      })
      .returning()
      .get();

    await db.insert(payslipLines).values([
      { payslipId: payslip.id, componentName: "Basic", type: "earning", amount: earnings.proratedBasic },
      { payslipId: payslip.id, componentName: "HRA", type: "earning", amount: earnings.proratedHra },
      { payslipId: payslip.id, componentName: "Overtime", type: "earning", amount: earnings.otAmount },
      { payslipId: payslip.id, componentName: "PF (Employee)", type: "deduction", amount: statutory.pfEmployee },
      { payslipId: payslip.id, componentName: "ESI (Employee)", type: "deduction", amount: statutory.esiEmployee },
      { payslipId: payslip.id, componentName: "Professional Tax", type: "deduction", amount: statutory.professionalTax },
      { payslipId: payslip.id, componentName: "TDS", type: "deduction", amount: tds },
      { payslipId: payslip.id, componentName: "Advances", type: "deduction", amount: advancesDeduction },
    ]).run();

    for (const a of pendingArrears) {
      await db.update(arrears).set({ appliedPayrollRunId: runId }).where(eq(arrears.id, a.id)).run();
    }

    created.push(payslip);
  }

  await db.update(payrollRuns).set({ status: "preview" }).where(eq(payrollRuns.id, runId)).run();
  return c.json({ runId, payslipsGenerated: created.length });
});

// Payroll cannot be locked while any attendance exception is unresolved — enforced here, not by reminder.
app.get("/runs/:id/exceptions", requirePermission("payroll.process"), async (c) => {
  const runId = Number(c.req.param("id"));
  const db = getDb(c.env.DB);
  const run = await db.select().from(payrollRuns).where(eq(payrollRuns.id, runId)).get();
  if (!run) return c.json({ error: "Not found" }, 404);

  const from = `${run.year}-${String(run.month).padStart(2, "0")}-01`;
  const to = `${run.year}-${String(run.month).padStart(2, "0")}-31`;
  const monthRecords = await db.select().from(attendanceRecords).all();
  const unresolved = monthRecords.filter(
    (r) => r.date >= from && r.date <= to && r.status !== "approved" && r.status !== "auto_approved",
  );
  return c.json(unresolved);
});

app.put("/runs/:id/lock", requirePermission("payroll.process"), async (c) => {
  const session = c.get("session");
  const runId = Number(c.req.param("id"));
  const db = getDb(c.env.DB);
  const run = await db.select().from(payrollRuns).where(eq(payrollRuns.id, runId)).get();
  if (!run) return c.json({ error: "Not found" }, 404);
  if (run.status !== "preview") return c.json({ error: "Run must be in preview before it can be locked" }, 409);

  const from = `${run.year}-${String(run.month).padStart(2, "0")}-01`;
  const to = `${run.year}-${String(run.month).padStart(2, "0")}-31`;
  const monthRecords = await db.select().from(attendanceRecords).all();
  const unresolved = monthRecords.filter(
    (r) => r.date >= from && r.date <= to && r.status !== "approved" && r.status !== "auto_approved",
  );
  if (unresolved.length > 0) {
    return c.json({ error: `${unresolved.length} attendance exception(s) unresolved for this month`, unresolved }, 409);
  }

  const updated = await db
    .update(payrollRuns)
    .set({ status: "locked", lockedByUserId: session.sub, lockedAt: new Date().toISOString() })
    .where(eq(payrollRuns.id, runId))
    .returning()
    .get();
  return c.json(updated);
});

app.get("/runs/:id/payslips", async (c) => {
  const session = c.get("session");
  const runId = Number(c.req.param("id"));
  const db = getDb(c.env.DB);
  const rows = await db.select().from(payslips).where(eq(payslips.payrollRunId, runId)).all();

  if (session.perms.includes("payroll.view_salary_all")) return c.json(rows);
  return c.json(rows.filter((p) => p.employeeId === session.employeeId));
});

app.get("/payslips/:id", async (c) => {
  const session = c.get("session");
  const id = Number(c.req.param("id"));
  const db = getDb(c.env.DB);
  const payslip = await db.select().from(payslips).where(eq(payslips.id, id)).get();
  if (!payslip) return c.json({ error: "Not found" }, 404);

  const canViewAll = session.perms.includes("payroll.view_salary_all");
  const isSelf = payslip.employeeId === session.employeeId;
  if (!canViewAll && !isSelf) return c.json({ error: "Forbidden" }, 403);

  const lines = await db.select().from(payslipLines).where(eq(payslipLines.payslipId, id)).all();
  return c.json({ ...payslip, lines });
});

// Generates a simple CSV bank transfer file for a locked run. Employees missing bank details are excluded and listed separately.
app.post("/runs/:id/bank-file", requirePermission("payroll.process"), async (c) => {
  const runId = Number(c.req.param("id"));
  const db = getDb(c.env.DB);
  const run = await db.select().from(payrollRuns).where(eq(payrollRuns.id, runId)).get();
  if (!run) return c.json({ error: "Not found" }, 404);
  if (run.status !== "locked") return c.json({ error: "Run must be locked before generating a bank file" }, 409);

  const runPayslips = await db.select().from(payslips).where(eq(payslips.payrollRunId, runId)).all();
  const lines = ["employee_code,account_holder_name,account_number,ifsc,net_pay"];
  const missingBankDetails: string[] = [];

  for (const payslip of runPayslips) {
    const employee = await db.select().from(employees).where(eq(employees.id, payslip.employeeId)).get();
    const bank = await db.select().from(employeeBankDetails).where(eq(employeeBankDetails.employeeId, payslip.employeeId)).get();
    if (!employee) continue;
    if (!bank) {
      missingBankDetails.push(employee.employeeCode);
      continue;
    }
    lines.push(`${employee.employeeCode},${bank.accountHolderName},${bank.accountNumber},${bank.ifsc},${payslip.netPay.toFixed(2)}`);
  }

  const content = lines.join("\n");
  const created = await db.insert(bankFiles).values({ payrollRunId: runId, content }).returning().get();
  return c.json({ ...created, missingBankDetails });
});

// --- Arrears: a correction on a locked/past run never edits that run — it becomes an arrear applied to a future run ---
app.post("/arrears", requirePermission("payroll.process"), async (c) => {
  const session = c.get("session");
  const body = await c.req.json<{ employeeId?: number; originPayrollRunId?: number; amount?: number; reason?: string }>();
  if (!body.employeeId || !body.originPayrollRunId || body.amount === undefined || !body.reason) {
    return c.json({ error: "employeeId, originPayrollRunId, amount, and reason are required" }, 400);
  }
  const db = getDb(c.env.DB);
  const created = await db
    .insert(arrears)
    .values({
      employeeId: body.employeeId,
      originPayrollRunId: body.originPayrollRunId,
      amount: body.amount,
      reason: body.reason,
      createdByUserId: session.sub,
    })
    .returning()
    .get();
  return c.json(created, 201);
});

app.get("/arrears", requirePermission("payroll.process"), async (c) => {
  const db = getDb(c.env.DB);
  return c.json(await db.select().from(arrears).all());
});

export default app;
