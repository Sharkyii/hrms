import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { getDb } from "../db/client";
import { employees, leaveRequests, attendanceRecords, payrollRuns, exitRequests } from "../db/schema";
import { requireAuth, requirePermission } from "../middleware/auth";
import type { Env } from "../types";

const app = new Hono<{ Bindings: Env }>();
app.use("*", requireAuth);
app.use("*", requirePermission("analytics.view_all"));

app.get("/overview", async (c) => {
  const db = getDb(c.env.DB);

  const allEmployees = await db.select().from(employees).all();
  const activeEmployees = allEmployees.filter((e) => e.status === "active");
  const byType: Record<string, number> = {};
  for (const e of activeEmployees) byType[e.employeeType] = (byType[e.employeeType] ?? 0) + 1;

  const pendingLeave = await db.select().from(leaveRequests).where(eq(leaveRequests.status, "pending")).all();
  const pendingAttendanceExceptions = (await db.select().from(attendanceRecords).all()).filter((r) => r.status === "pending_manager");
  const runs = await db.select().from(payrollRuns).all();
  const pendingExits = (await db.select().from(exitRequests).all()).filter((r) => r.status !== "settled" && r.status !== "cancelled");

  return c.json({
    employees: { total: allEmployees.length, active: activeEmployees.length, exited: allEmployees.length - activeEmployees.length, byType },
    pendingLeaveRequests: pendingLeave.length,
    pendingAttendanceExceptions: pendingAttendanceExceptions.length,
    payrollRuns: runs.map((r) => ({ id: r.id, month: r.month, year: r.year, status: r.status })),
    pendingExits: pendingExits.length,
  });
});

export default app;
