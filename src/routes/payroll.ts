import { Hono } from "hono";
import { and, desc, eq } from "drizzle-orm";
import { getDb } from "../db/client";
import type { Db } from "../db/client";
import {
  salaryStructures,
  salaryComponents,
  statutorySettings,
  employeeBankDetails,
  companySettings,
  employeePayrollDetails,
  payrollManualEntries,
  holidays,
  payrollRuns,
  payslips,
  payslipLines,
  arrears,
  bankFiles,
  attendanceRecords,
  employees,
  leaveBalances,
  leaveTypes,
  correctionAuditLog,
  users,
} from "../db/schema";
import { computePayableDays, computeEarnings, computeStatutory, STANDARD_WORKING_DAYS_PER_MONTH } from "../lib/payroll-engine";
import { generatePayslipPdf } from "../lib/payslip-pdf";
import { recordCorrection } from "../lib/audit";
import { requireAuth, requirePermission } from "../middleware/auth";
import type { SessionPayload } from "../middleware/auth";
import type { Env } from "../types";

const app = new Hono<{ Bindings: Env }>();
app.use("*", requireAuth);

const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

async function isTeamMember(db: Db, managerEmployeeId: number, targetEmployeeId: number): Promise<boolean> {
  const target = await db.select().from(employees).where(eq(employees.id, targetEmployeeId)).get();
  return target?.reportingManagerId === managerEmployeeId;
}

// --- Salary structures ---
// Every save is a new version — the previous one is closed off (effectiveTo) rather than edited,
// and the diff is written to correction_audit_log so there's always a full who/when/old->new trail.
app.post("/salary-structures", requirePermission("payroll.process"), async (c) => {
  const session = c.get("session");
  const body = await c.req.json<{
    employeeId?: number;
    basic?: number;
    hra?: number;
    effectiveFrom?: string;
    reason?: string;
    components?: Array<{ name: string; type: "earning" | "deduction"; amount: number }>;
  }>();
  if (!body.employeeId || body.basic === undefined || !body.effectiveFrom) {
    return c.json({ error: "employeeId, basic, and effectiveFrom are required" }, 400);
  }
  const db = getDb(c.env.DB);

  const previous = await db
    .select()
    .from(salaryStructures)
    .where(eq(salaryStructures.employeeId, body.employeeId))
    .orderBy(salaryStructures.effectiveFrom)
    .all();
  const activePrev = previous.at(-1);

  const created = await db
    .insert(salaryStructures)
    .values({
      employeeId: body.employeeId,
      basic: body.basic,
      hra: body.hra ?? 0,
      effectiveFrom: body.effectiveFrom,
      updatedByUserId: session.sub,
    })
    .returning()
    .get();

  for (const comp of body.components ?? []) {
    await db.insert(salaryComponents).values({ structureId: created.id, name: comp.name, type: comp.type, amount: comp.amount }).run();
  }

  if (activePrev) {
    const dayBefore = new Date(new Date(body.effectiveFrom).getTime() - 86400000).toISOString().slice(0, 10);
    await db.update(salaryStructures).set({ effectiveTo: dayBefore }).where(eq(salaryStructures.id, activePrev.id)).run();
    if (activePrev.basic !== created.basic) {
      await recordCorrection(db, {
        entityType: "salary_structure",
        entityId: body.employeeId,
        actorUserId: session.sub,
        fieldChanged: "basic",
        oldValue: String(activePrev.basic),
        newValue: String(created.basic),
        reason: body.reason,
      });
    }
    if (activePrev.hra !== created.hra) {
      await recordCorrection(db, {
        entityType: "salary_structure",
        entityId: body.employeeId,
        actorUserId: session.sub,
        fieldChanged: "hra",
        oldValue: String(activePrev.hra),
        newValue: String(created.hra),
        reason: body.reason,
      });
    }
  } else {
    await recordCorrection(db, {
      entityType: "salary_structure",
      entityId: body.employeeId,
      actorUserId: session.sub,
      fieldChanged: "basic",
      oldValue: null,
      newValue: String(created.basic),
      reason: body.reason ?? "Initial salary structure set",
    });
  }

  return c.json(created, 201);
});

app.get("/salary-structures/:employeeId", requirePermission("payroll.process"), async (c) => {
  const employeeId = Number(c.req.param("employeeId"));
  const db = getDb(c.env.DB);
  return c.json(await db.select().from(salaryStructures).where(eq(salaryStructures.employeeId, employeeId)).all());
});

// Everything Founder/HR need to see for one employee's salary: current figures + itemized
// components + the full audit trail of who changed what and when.
app.get("/salary-structures/:employeeId/full", requirePermission("payroll.process"), async (c) => {
  const employeeId = Number(c.req.param("employeeId"));
  const db = getDb(c.env.DB);

  const all = await db
    .select()
    .from(salaryStructures)
    .where(eq(salaryStructures.employeeId, employeeId))
    .orderBy(salaryStructures.effectiveFrom)
    .all();
  const current = all.at(-1) ?? null;
  const components = current ? await db.select().from(salaryComponents).where(eq(salaryComponents.structureId, current.id)).all() : [];

  const logRows = await db
    .select({ log: correctionAuditLog, actorEmployee: employees })
    .from(correctionAuditLog)
    .innerJoin(users, eq(correctionAuditLog.actorUserId, users.id))
    .innerJoin(employees, eq(users.employeeId, employees.id))
    .where(and(eq(correctionAuditLog.entityType, "salary_structure"), eq(correctionAuditLog.entityId, employeeId)))
    .orderBy(desc(correctionAuditLog.changedAt))
    .all();

  return c.json({
    current,
    components,
    changeLog: logRows.map((r) => ({
      id: r.log.id,
      fieldChanged: r.log.fieldChanged,
      oldValue: r.log.oldValue,
      newValue: r.log.newValue,
      reason: r.log.reason,
      changedAt: r.log.changedAt,
      changedByName: r.actorEmployee.fullName,
    })),
  });
});

// One row per employee with their current base salary — the roster view for Founder/HR.
app.get("/salary-roster", requirePermission("payroll.process"), async (c) => {
  const db = getDb(c.env.DB);
  const allEmployees = await db.select().from(employees).all();
  const allStructures = await db.select().from(salaryStructures).orderBy(salaryStructures.effectiveFrom).all();
  const allComponents = await db.select().from(salaryComponents).all();
  const allUsers = await db.select().from(users).all();

  const rows = allEmployees.map((emp) => {
    const structuresForEmp = allStructures.filter((s) => s.employeeId === emp.id);
    const current = structuresForEmp.at(-1) ?? null;
    const componentsTotal = current
      ? allComponents.filter((c) => c.structureId === current.id).reduce((sum, c) => sum + (c.type === "earning" ? c.amount : -c.amount), 0)
      : 0;
    const updatedByUser = current?.updatedByUserId ? allUsers.find((u) => u.id === current.updatedByUserId) : null;
    const updatedByEmployee = updatedByUser ? allEmployees.find((e) => e.id === updatedByUser.employeeId) : null;
    return {
      employeeId: emp.id,
      employeeName: emp.fullName,
      employeeCode: emp.employeeCode,
      status: emp.status,
      basic: current?.basic ?? null,
      hra: current?.hra ?? null,
      componentsTotal,
      ctc: current ? current.basic + current.hra + componentsTotal : null,
      effectiveFrom: current?.effectiveFrom ?? null,
      updatedByName: updatedByEmployee?.fullName ?? null,
    };
  });

  return c.json(rows);
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

// --- Company settings (single active row; used on the payslip PDF letterhead) ---
app.get("/company-settings", requirePermission("payroll.process"), async (c) => {
  const db = getDb(c.env.DB);
  const rows = await db.select().from(companySettings).all();
  return c.json(rows.at(-1) ?? null);
});

app.put("/company-settings", requirePermission("payroll.process"), async (c) => {
  const body = await c.req.json<Partial<typeof companySettings.$inferInsert>>();
  if (!body.name) return c.json({ error: "name is required" }, 400);
  const db = getDb(c.env.DB);
  const existing = (await db.select().from(companySettings).all()).at(-1);
  if (existing) {
    const updated = await db.update(companySettings).set(body).where(eq(companySettings.id, existing.id)).returning().get();
    return c.json(updated);
  }
  const created = await db.insert(companySettings).values({ name: body.name, ...body }).returning().get();
  return c.json(created, 201);
});

// --- Employee payroll details (PAN/UAN/PF/ESI/PRAN etc — set once, rarely changes) ---
app.get("/employee-payroll-details/:employeeId", requirePermission("payroll.process"), async (c) => {
  const employeeId = Number(c.req.param("employeeId"));
  const db = getDb(c.env.DB);
  const row = await db.select().from(employeePayrollDetails).where(eq(employeePayrollDetails.employeeId, employeeId)).get();
  return c.json(row ?? null);
});

app.put("/employee-payroll-details/:employeeId", requirePermission("payroll.process"), async (c) => {
  const employeeId = Number(c.req.param("employeeId"));
  const body = await c.req.json<Partial<typeof employeePayrollDetails.$inferInsert>>();
  const db = getDb(c.env.DB);
  const existing = await db.select().from(employeePayrollDetails).where(eq(employeePayrollDetails.employeeId, employeeId)).get();
  if (existing) {
    const updated = await db.update(employeePayrollDetails).set(body).where(eq(employeePayrollDetails.employeeId, employeeId)).returning().get();
    return c.json(updated);
  }
  const created = await db.insert(employeePayrollDetails).values({ employeeId, ...body }).returning().get();
  return c.json(created, 201);
});

// --- Bank details ---
app.get("/bank-details/:employeeId", requirePermission("payroll.process"), async (c) => {
  const employeeId = Number(c.req.param("employeeId"));
  const db = getDb(c.env.DB);
  const row = await db.select().from(employeeBankDetails).where(eq(employeeBankDetails.employeeId, employeeId)).get();
  return c.json(row ?? null);
});

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

// Period/status only (no amounts) — open to any authenticated user so "My Payslips" can list periods.
app.get("/runs", async (c) => {
  const db = getDb(c.env.DB);
  return c.json(await db.select().from(payrollRuns).all());
});

// Computes and persists one employee's payslip for a run: attendance-driven numbers are always
// recomputed fresh; loan/TDS come from payroll_manual_entries (the "things that change" HR/managers
// enter — see PUT /runs/:id/manual-entries/:employeeId), so they survive repeated recomputes.
async function computeAndSavePayslip(
  db: Db,
  run: typeof payrollRuns.$inferSelect,
  employee: typeof employees.$inferSelect,
  settings: typeof statutorySettings.$inferSelect,
) {
  const existing = await db
    .select()
    .from(payslips)
    .where(and(eq(payslips.payrollRunId, run.id), eq(payslips.employeeId, employee.id)))
    .get();
  if (existing) {
    await db.delete(payslipLines).where(eq(payslipLines.payslipId, existing.id)).run();
    await db.delete(payslips).where(eq(payslips.id, existing.id)).run();
  }

  const payableDays = await computePayableDays(db, employee.id, run.year, run.month);
  const earnings = await computeEarnings(db, employee.id, payableDays, STANDARD_WORKING_DAYS_PER_MONTH);
  const statutory = computeStatutory(earnings.proratedBasic, earnings.grossEarnings, settings);

  const employeeArrears = await db.select().from(arrears).where(eq(arrears.employeeId, employee.id)).all();
  const pendingArrears = employeeArrears.filter((a) => a.appliedPayrollRunId === null);
  const arrearsAmount = pendingArrears.reduce((sum, a) => sum + a.amount, 0);

  const manual = await db
    .select()
    .from(payrollManualEntries)
    .where(and(eq(payrollManualEntries.payrollRunId, run.id), eq(payrollManualEntries.employeeId, employee.id)))
    .get();
  const tds = manual?.tds ?? 0;
  const loan = manual?.loan ?? 0;

  const netPay =
    earnings.grossEarnings +
    arrearsAmount -
    statutory.pfEmployee -
    statutory.esiEmployee -
    statutory.professionalTax -
    earnings.componentDeductionsTotal -
    tds -
    loan;

  const payslip = await db
    .insert(payslips)
    .values({
      payrollRunId: run.id,
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
      advancesDeduction: loan,
      arrearsAmount,
      netPay: Math.round(Math.max(0, netPay) * 100) / 100,
    })
    .returning()
    .get();

  const lines: Array<{ payslipId: number; componentName: string; type: "earning" | "deduction"; amount: number }> = [
    { payslipId: payslip.id, componentName: "Basic", type: "earning", amount: earnings.proratedBasic },
    { payslipId: payslip.id, componentName: "HRA", type: "earning", amount: earnings.proratedHra },
  ];
  for (const comp of earnings.earningComponents) {
    lines.push({ payslipId: payslip.id, componentName: comp.name, type: "earning", amount: comp.amount });
  }
  if (earnings.otAmount > 0) lines.push({ payslipId: payslip.id, componentName: "Overtime", type: "earning", amount: earnings.otAmount });
  lines.push(
    { payslipId: payslip.id, componentName: "Professional Tax", type: "deduction", amount: statutory.professionalTax },
    { payslipId: payslip.id, componentName: "Provident Fund", type: "deduction", amount: statutory.pfEmployee },
    { payslipId: payslip.id, componentName: "ESI", type: "deduction", amount: statutory.esiEmployee },
    { payslipId: payslip.id, componentName: "Loan", type: "deduction", amount: loan },
    { payslipId: payslip.id, componentName: "TDS", type: "deduction", amount: tds },
  );
  for (const comp of earnings.deductionComponents) {
    lines.push({ payslipId: payslip.id, componentName: comp.name, type: "deduction", amount: comp.amount });
  }
  await db.insert(payslipLines).values(lines).run();

  for (const a of pendingArrears) {
    await db.update(arrears).set({ appliedPayrollRunId: run.id }).where(eq(arrears.id, a.id)).run();
  }

  return payslip;
}

// Computes payslips for every active employee for this run's month. Re-runnable while draft/preview;
// each call recomputes attendance-driven numbers fresh, but loan/TDS persist from payroll_manual_entries.
app.post("/runs/:id/preview", requirePermission("payroll.process"), async (c) => {
  const runId = Number(c.req.param("id"));
  const db = getDb(c.env.DB);

  const run = await db.select().from(payrollRuns).where(eq(payrollRuns.id, runId)).get();
  if (!run) return c.json({ error: "Not found" }, 404);
  if (run.status === "locked") return c.json({ error: "Run is locked" }, 409);

  const settingsRows = await db.select().from(statutorySettings).all();
  const settings = settingsRows.at(-1);
  if (!settings) return c.json({ error: "No statutory settings configured" }, 400);

  const activeEmployees = await db.select().from(employees).where(eq(employees.status, "active")).all();
  const created = [];
  for (const employee of activeEmployees) {
    created.push(await computeAndSavePayslip(db, run, employee, settings));
  }

  await db.update(payrollRuns).set({ status: "preview" }).where(eq(payrollRuns.id, runId)).run();
  return c.json({ runId, payslipsGenerated: created.length });
});

// The per-employee inputs that change month to month — HR can edit anyone; a manager can edit their
// own team, but only while the run is still open (a locked month is never edited).
app.put("/runs/:id/manual-entries/:employeeId", async (c) => {
  const session = c.get("session");
  const runId = Number(c.req.param("id"));
  const employeeId = Number(c.req.param("employeeId"));
  const db = getDb(c.env.DB);

  const canEditAny = session.perms.includes("payroll.process");
  const canEditTeam = session.perms.includes("payroll.edit_team") && (await isTeamMember(db, session.employeeId, employeeId));
  if (!canEditAny && !canEditTeam) return c.json({ error: "Forbidden" }, 403);

  const run = await db.select().from(payrollRuns).where(eq(payrollRuns.id, runId)).get();
  if (!run) return c.json({ error: "Not found" }, 404);
  if (run.status === "locked") return c.json({ error: "This run is locked and can no longer be edited" }, 409);

  const body = await c.req.json<{ loan?: number; tds?: number }>();
  const existing = await db
    .select()
    .from(payrollManualEntries)
    .where(and(eq(payrollManualEntries.payrollRunId, runId), eq(payrollManualEntries.employeeId, employeeId)))
    .get();

  if (existing) {
    await db
      .update(payrollManualEntries)
      .set({ loan: body.loan ?? existing.loan, tds: body.tds ?? existing.tds, updatedByUserId: session.sub, updatedAt: new Date().toISOString() })
      .where(eq(payrollManualEntries.id, existing.id))
      .run();
  } else {
    await db
      .insert(payrollManualEntries)
      .values({ payrollRunId: runId, employeeId, loan: body.loan ?? 0, tds: body.tds ?? 0, updatedByUserId: session.sub })
      .run();
  }

  // If this run has already been previewed, keep that employee's payslip in sync immediately.
  if (run.status === "preview") {
    const settingsRows = await db.select().from(statutorySettings).all();
    const settings = settingsRows.at(-1);
    const employee = await db.select().from(employees).where(eq(employees.id, employeeId)).get();
    if (settings && employee) await computeAndSavePayslip(db, run, employee, settings);
  }

  return c.json({ ok: true });
});

app.get("/runs/:id/manual-entries", async (c) => {
  const session = c.get("session");
  const runId = Number(c.req.param("id"));
  const db = getDb(c.env.DB);
  const rows = await db.select().from(payrollManualEntries).where(eq(payrollManualEntries.payrollRunId, runId)).all();

  if (session.perms.includes("payroll.process")) return c.json(rows);
  if (session.perms.includes("payroll.edit_team")) {
    const team = await db.select({ id: employees.id }).from(employees).where(eq(employees.reportingManagerId, session.employeeId)).all();
    const teamIds = new Set(team.map((t) => t.id));
    return c.json(rows.filter((r) => teamIds.has(r.employeeId)));
  }
  return c.json([]);
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

async function visiblePayslipIds(db: Db, session: SessionPayload, runId: number): Promise<Set<number> | "all"> {
  if (session.perms.includes("payroll.view_salary_all")) return "all";
  const ids = new Set<number>([session.employeeId]);
  if (session.perms.includes("payroll.view_team")) {
    const team = await db.select({ id: employees.id }).from(employees).where(eq(employees.reportingManagerId, session.employeeId)).all();
    for (const t of team) ids.add(t.id);
  }
  return ids;
}

app.get("/runs/:id/payslips", async (c) => {
  const session = c.get("session");
  const runId = Number(c.req.param("id"));
  const db = getDb(c.env.DB);
  const rows = await db.select().from(payslips).where(eq(payslips.payrollRunId, runId)).all();

  const visible = await visiblePayslipIds(db, session, runId);
  if (visible === "all") return c.json(rows);
  return c.json(rows.filter((p) => visible.has(p.employeeId)));
});

app.get("/payslips/:id", async (c) => {
  const session = c.get("session");
  const id = Number(c.req.param("id"));
  const db = getDb(c.env.DB);
  const payslip = await db.select().from(payslips).where(eq(payslips.id, id)).get();
  if (!payslip) return c.json({ error: "Not found" }, 404);

  const visible = await visiblePayslipIds(db, session, payslip.payrollRunId);
  if (visible !== "all" && !visible.has(payslip.employeeId)) return c.json({ error: "Forbidden" }, 403);

  const lines = await db.select().from(payslipLines).where(eq(payslipLines.payslipId, id)).all();
  return c.json({ ...payslip, lines });
});

// Renders the payslip as a PDF matching the standard company letterhead template.
app.get("/payslips/:id/pdf", async (c) => {
  const session = c.get("session");
  const id = Number(c.req.param("id"));
  const db = getDb(c.env.DB);

  const payslip = await db.select().from(payslips).where(eq(payslips.id, id)).get();
  if (!payslip) return c.json({ error: "Not found" }, 404);

  const visible = await visiblePayslipIds(db, session, payslip.payrollRunId);
  if (visible !== "all" && !visible.has(payslip.employeeId)) return c.json({ error: "Forbidden" }, 403);

  const run = await db.select().from(payrollRuns).where(eq(payrollRuns.id, payslip.payrollRunId)).get();
  const employee = await db.select().from(employees).where(eq(employees.id, payslip.employeeId)).get();
  if (!run || !employee) return c.json({ error: "Not found" }, 404);

  const lines = await db.select().from(payslipLines).where(eq(payslipLines.payslipId, id)).all();
  const company = (await db.select().from(companySettings).all()).at(-1);
  const payrollDetails = await db.select().from(employeePayrollDetails).where(eq(employeePayrollDetails.employeeId, employee.id)).get();
  const bank = await db.select().from(employeeBankDetails).where(eq(employeeBankDetails.employeeId, employee.id)).get();

  const balanceRows = await db
    .select({ balance: leaveBalances, type: leaveTypes })
    .from(leaveBalances)
    .innerJoin(leaveTypes, eq(leaveBalances.leaveTypeId, leaveTypes.id))
    .where(and(eq(leaveBalances.employeeId, employee.id), eq(leaveBalances.year, run.year)))
    .all();
  const paidLeaveBalance = balanceRows.filter((r) => r.type.isPaid).reduce((sum, r) => sum + (r.balance.allocated - r.balance.used), 0);

  const pdfBytes = await generatePayslipPdf({
    company: {
      name: company?.name ?? "Your Company Name",
      addressLine1: company?.addressLine1 ?? null,
      addressLine2: company?.addressLine2 ?? null,
      panNumber: company?.panNumber ?? null,
      logoBase64: company?.logoBase64 ?? null,
      signatureBase64: company?.signatureBase64 ?? null,
      signatoryLabel: company?.signatoryLabel ?? "Authorized Signatory",
    },
    employee: {
      fullName: employee.fullName,
      employeeCode: employee.employeeCode,
      designation: employee.designation,
      department: employee.department,
      dateOfJoining: employee.dateOfJoining,
    },
    payrollDetails: payrollDetails ?? null,
    bankName: bank ? `${bank.bankName ?? ""} ${bank.accountNumber ?? ""}`.trim() : null,
    periodLabel: `${MONTH_NAMES[run.month - 1]} -${run.year}`,
    attendance: {
      present: payslip.presentDays,
      paidLeave: payslip.paidLeaveDays,
      paidLeaveBalance: Math.max(0, paidLeaveBalance),
    },
    earningLines: lines.filter((l) => l.type === "earning").map((l) => ({ name: l.componentName, amount: l.amount })),
    deductionLines: lines.filter((l) => l.type === "deduction").map((l) => ({ name: l.componentName, amount: l.amount })),
    totalEarnings: payslip.grossEarnings,
    totalDeductions: payslip.grossEarnings - payslip.netPay + payslip.arrearsAmount,
    netAmount: payslip.netPay,
  });

  return new Response(new Uint8Array(pdfBytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="payslip-${employee.employeeCode}-${run.month}-${run.year}.pdf"`,
    },
  });
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
