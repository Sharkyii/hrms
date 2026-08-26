import { Hono } from "hono";
import { and, desc, eq, inArray } from "drizzle-orm";
import { getDb } from "../db/client";
import { employeeDocuments, employees, exitClearances, exitRequests, fullAndFinalSettlements, payslips } from "../db/schema";
import { requireAuth, requirePermission } from "../middleware/auth";
import { generateRelievingLetter, generateExperienceCertificate } from "../lib/exit-letters";
import type { Env } from "../types";

const app = new Hono<{ Bindings: Env }>();
app.use("*", requireAuth);

// Any employee can file their own resignation; HR/founder manage clearance and settlement.
app.post("/requests", async (c) => {
  const session = c.get("session");
  const body = await c.req.json<{ employeeId?: number; resignationDate?: string; lastWorkingDay?: string; reason?: string }>();
  const employeeId = body.employeeId ?? session.employeeId;
  const isSelf = employeeId === session.employeeId;
  if (!isSelf && !session.perms.includes("exit.manage") && !session.perms.includes("employee.manage")) return c.json({ error: "Forbidden" }, 403);
  if (!body.lastWorkingDay) return c.json({ error: "lastWorkingDay is required" }, 400);
  const db = getDb(c.env.DB);
  const employee = await db.select().from(employees).where(eq(employees.id, employeeId)).get();
  if (!employee) return c.json({ error: "Employee not found" }, 404);
  if (employee.status !== "active") return c.json({ error: "Employee is already offboarding or exited" }, 409);
  const existing = await db.select().from(exitRequests).where(and(eq(exitRequests.employeeId, employeeId), inArray(exitRequests.status, ["pending", "in_clearance"]))).get();
  if (existing) return c.json({ error: "An exit request is already in progress for this employee" }, 409);

  const resignationDate = body.resignationDate ?? new Date().toISOString().slice(0, 10);
  const created = await db
    .insert(exitRequests)
    .values({ employeeId, resignationDate, lastWorkingDay: body.lastWorkingDay, reason: body.reason ?? null })
    .returning()
    .get();
  await db.update(employees).set({ status: "offboarding", updatedAt: new Date().toISOString() }).where(eq(employees.id, employeeId)).run();
  return c.json(created, 201);
});

app.get("/requests", async (c) => {
  const session = c.get("session");
  const db = getDb(c.env.DB);
  if (session.perms.includes("exit.manage")) return c.json(await db.select().from(exitRequests).all());
  return c.json(await db.select().from(exitRequests).where(eq(exitRequests.employeeId, session.employeeId)).all());
});

app.post("/requests/:id/clearances", requirePermission("exit.manage"), async (c) => {
  const exitRequestId = Number(c.req.param("id"));
  const body = await c.req.json<{ department?: string }>();
  if (!body.department) return c.json({ error: "department is required" }, 400);
  const db = getDb(c.env.DB);
  const created = await db.insert(exitClearances).values({ exitRequestId, department: body.department }).returning().get();
  await db.update(exitRequests).set({ status: "in_clearance" }).where(eq(exitRequests.id, exitRequestId)).run();
  return c.json(created, 201);
});

app.put("/clearances/:id", requirePermission("exit.manage"), async (c) => {
  const session = c.get("session");
  const id = Number(c.req.param("id"));
  const body = await c.req.json<{ remarks?: string }>();
  const db = getDb(c.env.DB);
  const updated = await db
    .update(exitClearances)
    .set({ clearedByUserId: session.sub, clearedAt: new Date().toISOString(), remarks: body.remarks ?? null })
    .where(eq(exitClearances.id, id))
    .returning()
    .get();
  if (!updated) return c.json({ error: "Not found" }, 404);
  return c.json(updated);
});

// Processing settlement marks the employee as exited — calculates from last payslip and generates letters.
app.post("/requests/:id/settlement", requirePermission("exit.manage"), async (c) => {
  const exitRequestId = Number(c.req.param("id"));
  const body = await c.req.json<{ dues?: number; deductions?: number }>();
  const db = getDb(c.env.DB);
  if ((body.dues !== undefined && !Number.isFinite(body.dues)) || (body.deductions !== undefined && !Number.isFinite(body.deductions))) {
    return c.json({ error: "dues and deductions must be valid numbers" }, 400);
  }

  const request = await db.select().from(exitRequests).where(eq(exitRequests.id, exitRequestId)).get();
  if (!request) return c.json({ error: "Not found" }, 404);
  if (request.status === "settled") return c.json({ error: "This exit request has already been settled" }, 409);

  const emp = await db.select().from(employees).where(eq(employees.id, request.employeeId)).get();
  if (!emp) return c.json({ error: "Employee not found" }, 404);

  // Auto-calculate from last payslip if not provided
  let dues = body.dues ?? 0;
  let deductions = body.deductions ?? 0;

  if (body.dues === undefined) {
    const lastPayslip = await db
      .select()
      .from(payslips)
      .where(eq(payslips.employeeId, request.employeeId))
      .orderBy(desc(payslips.generatedAt))
      .limit(1)
      .get();

    if (lastPayslip) {
      dues = lastPayslip.netPay ?? 0;
    }
  }

  const netSettlement = dues - deductions;

  // Generate relieving letter and experience certificate
  const relievingPdf = await generateRelievingLetter({
    employeeName: emp.fullName,
    employeeCode: emp.employeeCode,
    designation: emp.designation || "Employee",
    department: emp.department || "General",
    dateOfJoining: emp.dateOfJoining,
    lastWorkingDay: request.lastWorkingDay,
    settlementAmount: netSettlement,
  });

  const experiencePdf = await generateExperienceCertificate({
    employeeName: emp.fullName,
    employeeCode: emp.employeeCode,
    designation: emp.designation || "Employee",
    department: emp.department || "General",
    dateOfJoining: emp.dateOfJoining,
    lastWorkingDay: request.lastWorkingDay,
  });

  const dateStamp = new Date().toISOString().slice(0, 10).replaceAll("-", "");
  const baseKey = `employees/${emp.id}/exit-letters`;
  const relievingKey = `${baseKey}/relieving_${emp.employeeCode}_${dateStamp}.pdf`;
  const experienceKey = `${baseKey}/experience_${emp.employeeCode}_${dateStamp}.pdf`;
  await Promise.all([
    c.env.DOCUMENTS.put(relievingKey, relievingPdf, { httpMetadata: { contentType: "application/pdf" } }),
    c.env.DOCUMENTS.put(experienceKey, experiencePdf, { httpMetadata: { contentType: "application/pdf" } }),
  ]);
  const letters = await db
    .insert(employeeDocuments)
    .values([
      { employeeId: emp.id, docType: "relieving_letter", fileName: `Relieving Letter - ${emp.employeeCode}.pdf`, r2Key: relievingKey, contentType: "application/pdf", fileSize: relievingPdf.byteLength, uploadedByUserId: c.get("session").sub },
      { employeeId: emp.id, docType: "experience_certificate", fileName: `Experience Certificate - ${emp.employeeCode}.pdf`, r2Key: experienceKey, contentType: "application/pdf", fileSize: experiencePdf.byteLength, uploadedByUserId: c.get("session").sub },
    ])
    .returning()
    .all();

  const created = await db
    .insert(fullAndFinalSettlements)
    .values({ exitRequestId, dues, deductions, netSettlement, processedAt: new Date().toISOString() })
    .returning()
    .get();

  await db.update(exitRequests).set({ status: "settled" }).where(eq(exitRequests.id, exitRequestId)).run();
  await db.update(employees).set({ status: "exited", updatedAt: new Date().toISOString() }).where(eq(employees.id, request.employeeId)).run();

  return c.json({ settlement: created, letters: letters.map((letter) => ({ id: letter.id, docType: letter.docType, fileName: letter.fileName, downloadUrl: `/api/exit/requests/${exitRequestId}/letters/${letter.id}/download` })) }, 201);
});

// These use exit permissions rather than the general employee-document permissions so HR can
// complete an exit even when its role cannot browse the employee's whole document record.
app.get("/requests/:id/letters", async (c) => {
  const session = c.get("session");
  const exitRequestId = Number(c.req.param("id"));
  const db = getDb(c.env.DB);
  const request = await db.select().from(exitRequests).where(eq(exitRequests.id, exitRequestId)).get();
  if (!request) return c.json({ error: "Not found" }, 404);
  if (request.employeeId !== session.employeeId && !session.perms.includes("exit.manage")) return c.json({ error: "Forbidden" }, 403);
  const docs = await db.select().from(employeeDocuments).where(and(eq(employeeDocuments.employeeId, request.employeeId), inArray(employeeDocuments.docType, ["relieving_letter", "experience_certificate"]))).orderBy(desc(employeeDocuments.uploadedAt)).all();
  return c.json(docs.map((doc) => ({ id: doc.id, docType: doc.docType, fileName: doc.fileName, downloadUrl: `/api/exit/requests/${exitRequestId}/letters/${doc.id}/download` })));
});

app.get("/requests/:id/letters/:docId/download", async (c) => {
  const session = c.get("session");
  const exitRequestId = Number(c.req.param("id"));
  const docId = Number(c.req.param("docId"));
  const db = getDb(c.env.DB);
  const request = await db.select().from(exitRequests).where(eq(exitRequests.id, exitRequestId)).get();
  if (!request) return c.json({ error: "Not found" }, 404);
  if (request.employeeId !== session.employeeId && !session.perms.includes("exit.manage")) return c.json({ error: "Forbidden" }, 403);
  const doc = await db.select().from(employeeDocuments).where(and(eq(employeeDocuments.id, docId), eq(employeeDocuments.employeeId, request.employeeId), inArray(employeeDocuments.docType, ["relieving_letter", "experience_certificate"]))).get();
  if (!doc) return c.json({ error: "Not found" }, 404);
  const object = await c.env.DOCUMENTS.get(doc.r2Key);
  if (!object) return c.json({ error: "File missing from storage" }, 404);
  return new Response(object.body, { headers: { "Content-Type": doc.contentType, "Content-Disposition": `attachment; filename="${doc.fileName}"`, "Content-Length": String(doc.fileSize) } });
});

export default app;
