import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { getDb } from "../db/client";
import { attendanceCorrectionRequests, attendanceRecords, employees } from "../db/schema";
import { recordCorrection } from "../lib/audit";
import { requireAuth, requirePermission } from "../middleware/auth";
import type { Env } from "../types";

const app = new Hono<{ Bindings: Env }>();
app.use("*", requireAuth);

const CORRECTION_WINDOW_DAYS = 7;

// Employees can request a correction on their own attendance within 7 days of the attendance date.
app.post("/", requirePermission("attendance.mark_own"), async (c) => {
  const session = c.get("session");
  const body = await c.req.json<{ attendanceId?: number; field?: string; newValue?: string; reason?: string }>();
  if (!body.attendanceId || !body.field || !body.newValue || !body.reason) {
    return c.json({ error: "attendanceId, field, newValue, and reason are required" }, 400);
  }

  const db = getDb(c.env.DB);
  const record = await db.select().from(attendanceRecords).where(eq(attendanceRecords.id, body.attendanceId)).get();
  if (!record) return c.json({ error: "Attendance record not found" }, 404);
  if (record.employeeId !== session.employeeId) return c.json({ error: "Forbidden" }, 403);

  const attendanceDate = new Date(record.date);
  const deadline = new Date(attendanceDate);
  deadline.setDate(deadline.getDate() + CORRECTION_WINDOW_DAYS);
  if (new Date() > deadline) {
    return c.json({ error: `Correction window (${CORRECTION_WINDOW_DAYS} days) has expired for this date` }, 403);
  }

  const oldValue = body.field === "punchInAt" ? record.punchInAt : body.field === "punchOutAt" ? record.punchOutAt : null;

  const created = await db
    .insert(attendanceCorrectionRequests)
    .values({
      attendanceId: body.attendanceId,
      requestedByUserId: session.sub,
      fieldChanged: body.field,
      oldValue,
      newValue: body.newValue,
      reason: body.reason,
      expiresAt: deadline.toISOString(),
    })
    .returning()
    .get();

  return c.json(created, 201);
});

app.get("/", requirePermission("attendance.approve_team"), async (c) => {
  const session = c.get("session");
  const db = getDb(c.env.DB);

  if (session.perms.includes("attendance.approve_final")) {
    return c.json(await db.select().from(attendanceCorrectionRequests).where(eq(attendanceCorrectionRequests.status, "pending")).all());
  }

  const rows = await db
    .select({ request: attendanceCorrectionRequests, attendance: attendanceRecords, employee: employees })
    .from(attendanceCorrectionRequests)
    .innerJoin(attendanceRecords, eq(attendanceCorrectionRequests.attendanceId, attendanceRecords.id))
    .innerJoin(employees, eq(attendanceRecords.employeeId, employees.id))
    .where(eq(attendanceCorrectionRequests.status, "pending"))
    .all();
  return c.json(rows.filter((r) => r.employee.reportingManagerId === session.employeeId).map((r) => r.request));
});

app.put("/:id/review", requirePermission("attendance.approve_team"), async (c) => {
  const session = c.get("session");
  const id = Number(c.req.param("id"));
  const body = await c.req.json<{ decision?: "approved" | "rejected" }>();
  if (body.decision !== "approved" && body.decision !== "rejected") {
    return c.json({ error: "decision must be 'approved' or 'rejected'" }, 400);
  }

  const db = getDb(c.env.DB);
  const request = await db.select().from(attendanceCorrectionRequests).where(eq(attendanceCorrectionRequests.id, id)).get();
  if (!request) return c.json({ error: "Not found" }, 404);
  if (request.status !== "pending") return c.json({ error: "Already reviewed" }, 409);

  await db
    .update(attendanceCorrectionRequests)
    .set({ status: body.decision, reviewedByUserId: session.sub, reviewedAt: new Date().toISOString() })
    .where(eq(attendanceCorrectionRequests.id, id))
    .run();

  if (body.decision === "approved") {
    const patch: Partial<typeof attendanceRecords.$inferInsert> = { updatedAt: new Date().toISOString() };
    (patch as Record<string, unknown>)[request.fieldChanged] = request.newValue;
    await db.update(attendanceRecords).set(patch).where(eq(attendanceRecords.id, request.attendanceId)).run();

    await recordCorrection(db, {
      entityType: "attendance",
      entityId: request.attendanceId,
      actorUserId: session.sub,
      fieldChanged: request.fieldChanged,
      oldValue: request.oldValue,
      newValue: request.newValue,
      reason: request.reason,
    });
  }

  return c.json({ id, decision: body.decision });
});

export default app;
