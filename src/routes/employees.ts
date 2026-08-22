import { Hono } from "hono";
import { eq, or, desc, and, isNull } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "../db/client";
import {
  employees,
  employeeTypeValues,
  employeeCategoryValues,
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
  salaryStructures,
  salaryComponents,
  statutorySettings,
  employeePayrollDetails,
  employeeBankDetails,
  employeeExtendedDetails,
  employeeDocuments,
  employeeDocumentTypeValues,
} from "../db/schema";
import { computePayableDays, computeStatutory } from "../lib/payroll-engine";
import { computeKraScore } from "../lib/kra-score";
import { requireAuth, requirePermission } from "../middleware/auth";
import type { Env } from "../types";

const app = new Hono<{ Bindings: Env }>();
app.use("*", requireAuth);

function addMonths(dateStr: string, months: number): string {
  const d = new Date(dateStr);
  d.setMonth(d.getMonth() + months);
  return d.toISOString().slice(0, 10);
}

const createEmployeeSchema = z.object({
  employeeCode: z.string().trim().min(1),
  fullName: z.string().trim().min(1),
  email: z.string().trim().toLowerCase().email(),
  phone: z.string().trim().min(1).optional(),
  employeeType: z.enum(employeeTypeValues),
  department: z.string().trim().min(1).optional(),
  designation: z.string().trim().min(1).optional(),
  category: z.enum(employeeCategoryValues).optional(),
  reportingManagerId: z.number().int().positive().optional(),
  dateOfJoining: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "dateOfJoining must be YYYY-MM-DD"),
});

app.get("/", async (c) => {
  const session = c.get("session");
  const db = getDb(c.env.DB);

  let rows = [];
  if (session.perms.includes("employee.view_all")) {
    rows = await db.select().from(employees).all();
  } else if (session.perms.includes("employee.view_team")) {
    rows = await db
      .select()
      .from(employees)
      .where(or(eq(employees.reportingManagerId, session.employeeId), eq(employees.id, session.employeeId)))
      .all();
  } else {
    const self = await db.select().from(employees).where(eq(employees.id, session.employeeId)).get();
    rows = self ? [self] : [];
  }

  const cycles = await db.select().from(kraCycles).all();
  const openCycle = cycles.find((cy) => cy.status === "open") ?? cycles.at(-1) ?? null;
  if (openCycle) {
    const goals = await db.select().from(kraGoals).where(eq(kraGoals.cycleId, openCycle.id)).all();
    const ratings = await db.select().from(kraRatings).all();
    const ratingsByGoalId = new Map(ratings.map((r) => [r.goalId, r]));
    
    return c.json(rows.map(emp => {
      const empGoals = goals.filter(g => g.employeeId === emp.id);
      const score = computeKraScore(empGoals, ratingsByGoalId);
      return { ...emp, kraScore: score.score, kraCategory: score.category };
    }));
  }

  return c.json(rows.map(emp => ({ ...emp, kraScore: null, kraCategory: null })));
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

  let payrollDetails: unknown = null;
  let ctcBreakdown: unknown = null;
  let extendedDetails: unknown = null;
  let bankDetails: unknown = null;
  if (canViewSalary) {
    payrollDetails = (await db.select().from(employeePayrollDetails).where(eq(employeePayrollDetails.employeeId, id)).get()) ?? null;
    extendedDetails = (await db.select().from(employeeExtendedDetails).where(eq(employeeExtendedDetails.employeeId, id)).get()) ?? null;
    bankDetails = (await db.select().from(employeeBankDetails).where(eq(employeeBankDetails.employeeId, id)).get()) ?? null;

    const structures = await db
      .select()
      .from(salaryStructures)
      .where(eq(salaryStructures.employeeId, id))
      .orderBy(salaryStructures.effectiveFrom)
      .all();
    const currentStructure = structures.at(-1);
    if (currentStructure) {
      const components = await db.select().from(salaryComponents).where(eq(salaryComponents.structureId, currentStructure.id)).all();
      const earningComponents = components.filter((cmp) => cmp.type === "earning");
      const deductionComponents = components.filter((cmp) => cmp.type === "deduction");
      const otherAllowance = earningComponents.reduce((sum, cmp) => sum + cmp.amount, 0);
      const componentDeductions = deductionComponents.reduce((sum, cmp) => sum + cmp.amount, 0);
      const fixedGross = currentStructure.basic + currentStructure.hra + otherAllowance;

      const settingsRows = await db.select().from(statutorySettings).all();
      const settings = settingsRows.at(-1);
      if (settings) {
        const statutory = computeStatutory(currentStructure.basic, fixedGross, settings);
        const totalDeduction = statutory.pfEmployee + statutory.esiEmployee + statutory.professionalTax + componentDeductions;
        ctcBreakdown = {
          fixedBasic: currentStructure.basic,
          fixedHra: currentStructure.hra,
          fixedOtherAllowance: otherAllowance,
          fixedGrossSalary: fixedGross,
          esiEmployerPct: settings.esiEmployerPct,
          esiEmployeePct: settings.esiEmployeePct,
          esiEmployer: statutory.esiEmployer,
          esiEmployee: statutory.esiEmployee,
          pfEmployerPct: settings.pfEmployerPct,
          pfEmployeePct: settings.pfEmployeePct,
          pfEmployer: statutory.pfEmployer,
          pfEmployee: statutory.pfEmployee,
          professionalTax: statutory.professionalTax,
          otherDeductions: componentDeductions,
          totalDeduction,
          netPay: fixedGross - totalDeduction,
        };
      }
    }
  }

  const cycles = await db.select().from(kraCycles).all();
  const openCycle = cycles.find((cy) => cy.status === "open") ?? cycles.at(-1) ?? null;
  let kraGoalsWithRatings: unknown[] = [];
  let kraScore: ReturnType<typeof computeKraScore> = { score: null, weightRatedPct: 0, category: null };
  if (openCycle) {
    const goals = await db.select().from(kraGoals).where(and(eq(kraGoals.employeeId, id), eq(kraGoals.cycleId, openCycle.id))).all();
    const ratings = await db.select().from(kraRatings).all();
    kraGoalsWithRatings = goals.map((g) => ({ ...g, rating: ratings.find((r) => r.goalId === g.id) ?? null }));
    kraScore = computeKraScore(goals, new Map(ratings.map((r) => [r.goalId, r])));
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
    payrollDetails,
    ctcBreakdown,
    extendedDetails,
    bankDetails,
    kra: { cycleName: openCycle?.name ?? null, goals: kraGoalsWithRatings, ...kraScore },
    leave: {
      balances: balances.map((b) => ({ leaveType: b.type.name, allocated: b.balance.allocated, used: b.balance.used })),
      recent: recentLeave,
    },
    assets: assignedAssets.map((a) => a.asset),
    workLog,
  });
});

// Personal details, emergency contacts, and previous-employer history — HR/founder only, since
// it includes the employee's last-drawn salary at their previous job.
app.put("/:id/extended-details", requirePermission("employee.manage"), async (c) => {
  const id = Number(c.req.param("id"));
  const body = await c.req.json<Partial<typeof employeeExtendedDetails.$inferInsert>>();
  const db = getDb(c.env.DB);

  const existing = await db.select().from(employeeExtendedDetails).where(eq(employeeExtendedDetails.employeeId, id)).get();
  const patch = { ...body, employeeId: id, updatedAt: new Date().toISOString() };
  delete (patch as Record<string, unknown>).id;

  const saved = existing
    ? await db.update(employeeExtendedDetails).set(patch).where(eq(employeeExtendedDetails.employeeId, id)).returning().get()
    : await db.insert(employeeExtendedDetails).values(patch).returning().get();
  return c.json(saved);
});

const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024; // 10MB

// KYC/employment documents live in R2, keyed off the employee — the employee can upload their
// own (photo, Aadhar, PAN...), HR/founder can upload for anyone (offer letters, agreements...).
app.post("/:id/documents", async (c) => {
  const session = c.get("session");
  const id = Number(c.req.param("id"));
  const isSelf = id === session.employeeId;
  if (!isSelf && !session.perms.includes("employee.manage")) return c.json({ error: "Forbidden" }, 403);

  const db = getDb(c.env.DB);
  const employee = await db.select().from(employees).where(eq(employees.id, id)).get();
  if (!employee) return c.json({ error: "Not found" }, 404);

  const form = await c.req.formData().catch(() => null);
  const file = form?.get("file");
  const docType = form?.get("docType");
  if (!(file instanceof File) || typeof docType !== "string" || !(employeeDocumentTypeValues as readonly string[]).includes(docType)) {
    return c.json({ error: "file and a valid docType are required" }, 400);
  }
  if (file.size > MAX_DOCUMENT_BYTES) return c.json({ error: "File must be under 10MB" }, 400);

  const r2Key = `employees/${id}/${docType}/${Date.now()}-${file.name}`;
  const contentType = file.type || "application/octet-stream";
  await c.env.DOCUMENTS.put(r2Key, await file.arrayBuffer(), { httpMetadata: { contentType } });

  const created = await db
    .insert(employeeDocuments)
    .values({
      employeeId: id,
      docType: docType as (typeof employeeDocumentTypeValues)[number],
      fileName: file.name,
      r2Key,
      contentType,
      fileSize: file.size,
      uploadedByUserId: session.sub,
    })
    .returning()
    .get();
  return c.json(created, 201);
});

app.get("/:id/documents", async (c) => {
  const session = c.get("session");
  const id = Number(c.req.param("id"));
  const db = getDb(c.env.DB);
  const employee = await db.select().from(employees).where(eq(employees.id, id)).get();
  if (!employee) return c.json({ error: "Not found" }, 404);

  const canViewAll = session.perms.includes("employee.view_all");
  const canViewTeam = session.perms.includes("employee.view_team") && employee.reportingManagerId === session.employeeId;
  const isSelf = employee.id === session.employeeId;
  if (!canViewAll && !canViewTeam && !isSelf) return c.json({ error: "Forbidden" }, 403);

  const docs = await db.select().from(employeeDocuments).where(eq(employeeDocuments.employeeId, id)).orderBy(desc(employeeDocuments.uploadedAt)).all();
  return c.json(docs.map((d) => ({ id: d.id, docType: d.docType, fileName: d.fileName, contentType: d.contentType, fileSize: d.fileSize, uploadedAt: d.uploadedAt })));
});

app.get("/:id/documents/:docId/download", async (c) => {
  const session = c.get("session");
  const id = Number(c.req.param("id"));
  const docId = Number(c.req.param("docId"));
  const db = getDb(c.env.DB);
  const employee = await db.select().from(employees).where(eq(employees.id, id)).get();
  if (!employee) return c.json({ error: "Not found" }, 404);

  const canViewAll = session.perms.includes("employee.view_all");
  const canViewTeam = session.perms.includes("employee.view_team") && employee.reportingManagerId === session.employeeId;
  const isSelf = employee.id === session.employeeId;
  if (!canViewAll && !canViewTeam && !isSelf) return c.json({ error: "Forbidden" }, 403);

  const doc = await db.select().from(employeeDocuments).where(eq(employeeDocuments.id, docId)).get();
  if (!doc || doc.employeeId !== id) return c.json({ error: "Not found" }, 404);

  const object = await c.env.DOCUMENTS.get(doc.r2Key);
  if (!object) return c.json({ error: "File missing from storage" }, 404);

  return new Response(object.body, {
    headers: {
      "Content-Type": doc.contentType,
      "Content-Disposition": `attachment; filename="${doc.fileName}"`,
      "Content-Length": String(doc.fileSize),
    },
  });
});

app.delete("/:id/documents/:docId", requirePermission("employee.manage"), async (c) => {
  const id = Number(c.req.param("id"));
  const docId = Number(c.req.param("docId"));
  const db = getDb(c.env.DB);
  const doc = await db.select().from(employeeDocuments).where(eq(employeeDocuments.id, docId)).get();
  if (!doc || doc.employeeId !== id) return c.json({ error: "Not found" }, 404);

  await c.env.DOCUMENTS.delete(doc.r2Key);
  await db.delete(employeeDocuments).where(eq(employeeDocuments.id, docId)).run();
  return c.json({ ok: true });
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
      category: body.category ?? null,
      reportingManagerId: body.reportingManagerId ?? null,
      dateOfJoining: body.dateOfJoining,
      confirmationDate: addMonths(body.dateOfJoining, 3),
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
  const editable = [
    "fullName",
    "phone",
    "employeeType",
    "department",
    "designation",
    "category",
    "reportingManagerId",
    "status",
    "confirmationDate",
  ] as const;
  for (const field of editable) {
    if (field in body) (patch as Record<string, unknown>)[field] = body[field];
  }

  const updated = await db.update(employees).set(patch).where(eq(employees.id, id)).returning().get();
  return c.json(updated);
});

export default app;
