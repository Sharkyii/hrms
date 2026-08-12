import { Hono } from "hono";
import { and, eq, inArray } from "drizzle-orm";
import { getDb } from "../db/client";
import { leaveRequests, leaveTypes, leaveBalances, employees } from "../db/schema";
import { requireAuth, requirePermission } from "../middleware/auth";
import type { Env } from "../types";

const app = new Hono<{ Bindings: Env }>();
app.use("*", requireAuth);

function daysBetweenInclusive(start: string, end: string): number {
  const ms = new Date(end).getTime() - new Date(start).getTime();
  return Math.floor(ms / 86_400_000) + 1;
}

app.get("/types", async (c) => {
  const db = getDb(c.env.DB);
  return c.json(await db.select().from(leaveTypes).all());
});

app.get("/balances", requirePermission("leave.apply"), async (c) => {
  const session = c.get("session");
  const db = getDb(c.env.DB);
  const year = Number(c.req.query("year") ?? new Date().getFullYear());
  return c.json(
    await db
      .select()
      .from(leaveBalances)
      .where(and(eq(leaveBalances.employeeId, session.employeeId), eq(leaveBalances.year, year)))
      .all(),
  );
});

app.post("/requests", requirePermission("leave.apply"), async (c) => {
  const session = c.get("session");
  const body = await c.req.json<{ leaveTypeId?: number; startDate?: string; endDate?: string; reason?: string }>();
  if (!body.leaveTypeId || !body.startDate || !body.endDate) {
    return c.json({ error: "leaveTypeId, startDate, and endDate are required" }, 400);
  }
  const days = daysBetweenInclusive(body.startDate, body.endDate);
  if (days <= 0) return c.json({ error: "endDate must not be before startDate" }, 400);

  const db = getDb(c.env.DB);
  const created = await db
    .insert(leaveRequests)
    .values({
      employeeId: session.employeeId,
      leaveTypeId: body.leaveTypeId,
      startDate: body.startDate,
      endDate: body.endDate,
      days,
      reason: body.reason ?? null,
    })
    .returning()
    .get();

  return c.json(created, 201);
});

app.get("/requests", async (c) => {
  const session = c.get("session");
  const db = getDb(c.env.DB);

  if (session.perms.includes("leave.view_all")) {
    return c.json(await db.select().from(leaveRequests).all());
  }
  if (session.perms.includes("leave.approve_team")) {
    const team = await db.select({ id: employees.id }).from(employees).where(eq(employees.reportingManagerId, session.employeeId)).all();
    const ids = [...team.map((t) => t.id), session.employeeId];
    return c.json(await db.select().from(leaveRequests).where(inArray(leaveRequests.employeeId, ids)).all());
  }
  return c.json(await db.select().from(leaveRequests).where(eq(leaveRequests.employeeId, session.employeeId)).all());
});

app.put("/requests/:id/decision", requirePermission("leave.approve_team"), async (c) => {
  const session = c.get("session");
  const id = Number(c.req.param("id"));
  const body = await c.req.json<{ decision?: "approved" | "rejected" }>();
  if (body.decision !== "approved" && body.decision !== "rejected") {
    return c.json({ error: "decision must be 'approved' or 'rejected'" }, 400);
  }

  const db = getDb(c.env.DB);
  const request = await db
    .select({ request: leaveRequests, employee: employees })
    .from(leaveRequests)
    .innerJoin(employees, eq(leaveRequests.employeeId, employees.id))
    .where(eq(leaveRequests.id, id))
    .get();
  if (!request) return c.json({ error: "Not found" }, 404);

  const isTheirManager = request.employee.reportingManagerId === session.employeeId;
  const isHrOrFounder = session.perms.includes("leave.view_all");
  if (!isTheirManager && !isHrOrFounder) return c.json({ error: "Forbidden" }, 403);

  const updated = await db
    .update(leaveRequests)
    .set({ status: body.decision, approvedByUserId: session.sub, approvedAt: new Date().toISOString() })
    .where(eq(leaveRequests.id, id))
    .returning()
    .get();

  if (body.decision === "approved") {
    const year = new Date(request.request.startDate).getFullYear();
    const balance = await db
      .select()
      .from(leaveBalances)
      .where(
        and(
          eq(leaveBalances.employeeId, request.request.employeeId),
          eq(leaveBalances.leaveTypeId, request.request.leaveTypeId),
          eq(leaveBalances.year, year),
        ),
      )
      .get();
    if (balance) {
      await db
        .update(leaveBalances)
        .set({ used: balance.used + request.request.days })
        .where(eq(leaveBalances.id, balance.id))
        .run();
    }
  }

  return c.json(updated);
});

export default app;
