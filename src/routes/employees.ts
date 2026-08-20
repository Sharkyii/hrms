import { Hono } from "hono";
import { eq, or, desc, and, isNull } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "../db/client";
import {
  employees,
  employeeTypeValues,
  attendanceRecords,
  payslips,
  payrollRuns,
  leaveBalances,
  leaveRequests,
  leaveTypes,
  kraCycles,
  kraGoals,
  kraRatings,
  assetAssignments,
  assets,
  workLogEntries,
} from "../db/schema";
import { computePayableDays } from "../lib/payroll-engine";
import { requireAuth, requirePermission } from "../middleware/auth";
import type { Env } from "../types";

const app = new Hono<{ Bindings: Env }>();
app.use("*", requireAuth);

const createEmployeeSchema = z.object({
  employeeCode: z.string().trim().min(1),
  fullName: z.string().trim().min(1),
  email: z.string().trim().toLowerCase().email(),
  phone: z.string().trim().min(1).optional(),
  employeeType: z.enum(employeeTypeValues),
  department: z.string().trim().min(1).optional(),
  designation: z.string().trim().min(1).optional(),
  reportingManagerId: z.number().int().positive().optional(),
  dateOfJoining: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "dateOfJoining must be YYYY-MM-DD"),
});

app.get("/", async (c) => {
  const session = c.get("session");
  const db = getDb(c.env.DB);

  if (session.perms.includes("employee.view_all")) {
    return c.json(await db.select().from(employees).all());
  }
  if (session.perms.includes("employee.view_team")) {
    const rows = await db
      .select()
      .from(employees)
      .where(or(eq(employees.reportingManagerId, session.employeeId), eq(employees.id, session.employeeId)))
      .all();
    return c.json(rows);
  }
  // employee.view_own only
  const self = await db.select().from(employees).where(eq(employees.id, session.employeeId)).get();
  return c.json(self ? [self] : []);
});

// Minimal, name-only listing any authenticated employee can see — used to pick a coworker when
// assigning a task. Deliberately excludes everything the full /employees list exposes.
app.get("/directory", async (c) => {
  const db = getDb(c.env.DB);
  const rows = await db
    .select({ id: employees.id, fullName: employees.fullName, department: employees.department, designation: employees.designation })
    .from(employees)
    .where(eq(employees.status, "active"))
    .all();
  return c.json(rows);
});

app.get("/:id", async (c) => {
  const session = c.get("session");
  const id = Number(c.req.param("id"));
  const db = getDb(c.env.DB);
  const row = await db.select().from(employees).where(eq(employees.id, id)).get();
  if (!row) return c.json({ error: "Not found" }, 404);

  const canViewAll = session.perms.includes("employee.view_all");
  const canViewTeam = session.perms.includes("employee.view_team") && row.reportingManagerId === session.employeeId;
  const isSelf = row.id === session.employeeId;
  if (!canViewAll && !canViewTeam && !isSelf) return c.json({ error: "Forbidden" }, 403);

  return c.json(row);
});

// One-stop employee profile: attendance summary + recent punches, payslips across every run,
// current KRA goals/ratings, leave balances + recent requests, and assigned assets — everything
// a founder/HR/manager wants when they click into one person, in a single call.
app.get("/:id/profile", async (c) => {
  const session = c.get("session");
  const id = Number(c.req.param("id"));
  const db = getDb(c.env.DB);

  const employee = await db.select().from(employees).where(eq(employees.id, id)).get();
  if (!employee) return c.json({ error: "Not found" }, 404);

  const canViewAll = session.perms.includes("employee.view_all");
  const canViewTeam = session.perms.includes("employee.view_team") && employee.reportingManagerId === session.employeeId;
  const isSelf = employee.id === session.employeeId;
  if (!canViewAll && !canViewTeam && !isSelf) return c.json({ error: "Forbidden" }, 403);

  const manager = employee.reportingManagerId
    ? await db.select().from(employees).where(eq(employees.id, employee.reportingManagerId)).get()
    : null;

  const now = new Date();
  const thisMonthSummary = await computePayableDays(db, id, now.getFullYear(), now.getMonth() + 1);
  const recentAttendance = await db
    .select()
    .from(attendanceRecords)
    .where(eq(attendanceRecords.employeeId, id))
    .orderBy(desc(attendanceRecords.date))
    .limit(15)
    .all();

  const canViewSalary = session.perms.includes("payroll.view_salary_all") || isSelf || canViewTeam;
  let payslipHistory: unknown[] = [];
  if (canViewSalary) {
    const rows = await db
      .select({ payslip: payslips, run: payrollRuns })
      .from(payslips)
      .innerJoin(payrollRuns, eq(payslips.payrollRunId, payrollRuns.id))
      .where(eq(payslips.employeeId, id))
      .all();
    payslipHistory = rows
      .sort((a, b) => (a.run.year === b.run.year ? b.run.month - a.run.month : b.run.year - a.run.year))
      .map((r) => ({
        payslipId: r.payslip.id,
        month: r.run.month,
        year: r.run.year,
        runStatus: r.run.status,
        grossEarnings: r.payslip.grossEarnings,
        netPay: r.payslip.netPay,
      }));
  }

  const cycles = await db.select().from(kraCycles).all();
  const openCycle = cycles.find((cy) => cy.status === "open") ?? cycles.at(-1) ?? null;
  let kraGoalsWithRatings: unknown[] = [];
  if (openCycle) {
    const goals = await db.select().from(kraGoals).where(and(eq(kraGoals.employeeId, id), eq(kraGoals.cycleId, openCycle.id))).all();
    const ratings = await db.select().from(kraRatings).all();
    kraGoalsWithRatings = goals.map((g) => ({ ...g, rating: ratings.find((r) => r.goalId === g.id) ?? null }));
  }

  const balances = await db
    .select({ balance: leaveBalances, type: leaveTypes })
    .from(leaveBalances)
    .innerJoin(leaveTypes, eq(leaveBalances.leaveTypeId, leaveTypes.id))
    .where(and(eq(leaveBalances.employeeId, id), eq(leaveBalances.year, now.getFullYear())))
    .all();
  const recentLeave = await db
    .select()
    .from(leaveRequests)
    .where(eq(leaveRequests.employeeId, id))
    .orderBy(desc(leaveRequests.createdAt))
    .limit(10)
    .all();

  const assignedAssets = await db
    .select({ asset: assets, assignment: assetAssignments })
    .from(assetAssignments)
    .innerJoin(assets, eq(assetAssignments.assetId, assets.id))
    .where(and(eq(assetAssignments.employeeId, id), isNull(assetAssignments.returnedAt)))
    .all();

  const workLog = await db
    .select()
    .from(workLogEntries)
    .where(eq(workLogEntries.employeeId, id))
    .orderBy(desc(workLogEntries.date), desc(workLogEntries.id))
    .limit(30)
    .all();

  return c.json({
    employee,
    managerName: manager?.fullName ?? null,
    isSelf,
    attendance: {
      thisMonthSummary,
      recent: recentAttendance,
    },
    payslips: canViewSalary ? payslipHistory : null,
    kra: { cycleName: openCycle?.name ?? null, goals: kraGoalsWithRatings },
    leave: {
      balances: balances.map((b) => ({ leaveType: b.type.name, allocated: b.balance.allocated, used: b.balance.used })),
      recent: recentLeave,
    },
    assets: assignedAssets.map((a) => a.asset),
    workLog,
  });
});

app.post("/", requirePermission("employee.manage"), async (c) => {
  const parsed = createEmployeeSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, 400);
  const body = parsed.data;

  const db = getDb(c.env.DB);
  const created = await db
    .insert(employees)
    .values({
      employeeCode: body.employeeCode,
      fullName: body.fullName,
      email: body.email,
      phone: body.phone ?? null,
      employeeType: body.employeeType,
      department: body.department ?? null,
      designation: body.designation ?? null,
      reportingManagerId: body.reportingManagerId ?? null,
      dateOfJoining: body.dateOfJoining,
    })
    .returning()
    .get();

  return c.json(created, 201);
});

app.put("/:id", requirePermission("employee.manage"), async (c) => {
  const id = Number(c.req.param("id"));
  const body = await c.req.json<Record<string, unknown>>();
  const db = getDb(c.env.DB);

  const existing = await db.select().from(employees).where(eq(employees.id, id)).get();
  if (!existing) return c.json({ error: "Not found" }, 404);

  const patch: Partial<typeof employees.$inferInsert> = { updatedAt: new Date().toISOString() };
  const editable = ["fullName", "phone", "employeeType", "department", "designation", "reportingManagerId", "status"] as const;
  for (const field of editable) {
    if (field in body) (patch as Record<string, unknown>)[field] = body[field];
  }

  const updated = await db.update(employees).set(patch).where(eq(employees.id, id)).returning().get();
  return c.json(updated);
});

export default app;
