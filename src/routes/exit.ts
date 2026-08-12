import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { getDb } from "../db/client";
import { exitRequests, exitClearances, fullAndFinalSettlements, employees } from "../db/schema";
import { requireAuth, requirePermission } from "../middleware/auth";
import type { Env } from "../types";

const app = new Hono<{ Bindings: Env }>();
app.use("*", requireAuth);

// Any employee can file their own resignation; HR/founder manage clearance and settlement.
app.post("/requests", async (c) => {
  const session = c.get("session");
  const body = await c.req.json<{ resignationDate?: string; lastWorkingDay?: string; reason?: string }>();
  if (!body.resignationDate || !body.lastWorkingDay) return c.json({ error: "resignationDate and lastWorkingDay are required" }, 400);
  const db = getDb(c.env.DB);
  const created = await db
    .insert(exitRequests)
    .values({ employeeId: session.employeeId, resignationDate: body.resignationDate, lastWorkingDay: body.lastWorkingDay, reason: body.reason ?? null })
    .returning()
    .get();
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

// Processing settlement marks the employee as exited — full & final closes out the employment record.
app.post("/requests/:id/settlement", requirePermission("exit.manage"), async (c) => {
  const exitRequestId = Number(c.req.param("id"));
  const body = await c.req.json<{ dues?: number; deductions?: number }>();
  const db = getDb(c.env.DB);

  const request = await db.select().from(exitRequests).where(eq(exitRequests.id, exitRequestId)).get();
  if (!request) return c.json({ error: "Not found" }, 404);

  const dues = body.dues ?? 0;
  const deductions = body.deductions ?? 0;
  const netSettlement = dues - deductions;

  const created = await db
    .insert(fullAndFinalSettlements)
    .values({ exitRequestId, dues, deductions, netSettlement, processedAt: new Date().toISOString() })
    .returning()
    .get();

  await db.update(exitRequests).set({ status: "settled" }).where(eq(exitRequests.id, exitRequestId)).run();
  await db.update(employees).set({ status: "exited", updatedAt: new Date().toISOString() }).where(eq(employees.id, request.employeeId)).run();

  return c.json(created, 201);
});

export default app;
