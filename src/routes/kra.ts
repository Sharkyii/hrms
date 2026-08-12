import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { getDb } from "../db/client";
import { kraCycles, kraGoals, kraRatings, employees } from "../db/schema";
import { requireAuth, requirePermission } from "../middleware/auth";
import type { Env } from "../types";

const app = new Hono<{ Bindings: Env }>();
app.use("*", requireAuth);

app.get("/cycles", async (c) => {
  const db = getDb(c.env.DB);
  return c.json(await db.select().from(kraCycles).all());
});

app.post("/cycles", requirePermission("kra.view_all"), async (c) => {
  const body = await c.req.json<{ name?: string; startDate?: string; endDate?: string }>();
  if (!body.name || !body.startDate || !body.endDate) return c.json({ error: "name, startDate, and endDate are required" }, 400);
  const db = getDb(c.env.DB);
  const created = await db.insert(kraCycles).values({ name: body.name, startDate: body.startDate, endDate: body.endDate }).returning().get();
  return c.json(created, 201);
});

app.post("/goals", async (c) => {
  const session = c.get("session");
  const body = await c.req.json<{ employeeId?: number; cycleId?: number; title?: string; weightPct?: number; target?: string }>();
  if (!body.employeeId || !body.cycleId || !body.title || body.weightPct === undefined) {
    return c.json({ error: "employeeId, cycleId, title, and weightPct are required" }, 400);
  }
  const db = getDb(c.env.DB);

  if (!session.perms.includes("kra.view_all")) {
    if (!session.perms.includes("kra.rate_team")) return c.json({ error: "Forbidden" }, 403);
    const target = await db.select().from(employees).where(eq(employees.id, body.employeeId)).get();
    if (!target || target.reportingManagerId !== session.employeeId) return c.json({ error: "Forbidden" }, 403);
  }

  const created = await db
    .insert(kraGoals)
    .values({ employeeId: body.employeeId, cycleId: body.cycleId, title: body.title, weightPct: body.weightPct, target: body.target ?? null })
    .returning()
    .get();
  return c.json(created, 201);
});

app.get("/goals", async (c) => {
  const session = c.get("session");
  const employeeId = Number(c.req.query("employeeId") ?? session.employeeId);
  const db = getDb(c.env.DB);

  const canViewAll = session.perms.includes("kra.view_all");
  const isSelf = employeeId === session.employeeId;
  let isTheirManager = false;
  if (!canViewAll && !isSelf && session.perms.includes("kra.rate_team")) {
    const target = await db.select().from(employees).where(eq(employees.id, employeeId)).get();
    isTheirManager = target?.reportingManagerId === session.employeeId;
  }
  if (!canViewAll && !isSelf && !isTheirManager) return c.json({ error: "Forbidden" }, 403);

  return c.json(await db.select().from(kraGoals).where(eq(kraGoals.employeeId, employeeId)).all());
});

async function upsertRating(db: ReturnType<typeof getDb>, goalId: number, patch: Partial<typeof kraRatings.$inferInsert>) {
  const existing = await db.select().from(kraRatings).where(eq(kraRatings.goalId, goalId)).get();
  if (existing) {
    return db.update(kraRatings).set(patch).where(eq(kraRatings.id, existing.id)).returning().get();
  }
  return db.insert(kraRatings).values({ goalId, ...patch }).returning().get();
}

app.put("/goals/:id/self-rating", async (c) => {
  const session = c.get("session");
  const goalId = Number(c.req.param("id"));
  const body = await c.req.json<{ rating?: number; comments?: string }>();
  if (body.rating === undefined) return c.json({ error: "rating is required" }, 400);

  const db = getDb(c.env.DB);
  const goal = await db.select().from(kraGoals).where(eq(kraGoals.id, goalId)).get();
  if (!goal) return c.json({ error: "Not found" }, 404);
  if (goal.employeeId !== session.employeeId) return c.json({ error: "Forbidden" }, 403);

  const updated = await upsertRating(db, goalId, { selfRating: body.rating, comments: body.comments ?? null });
  return c.json(updated);
});

app.put("/goals/:id/manager-rating", requirePermission("kra.rate_team"), async (c) => {
  const session = c.get("session");
  const goalId = Number(c.req.param("id"));
  const body = await c.req.json<{ rating?: number; comments?: string }>();
  if (body.rating === undefined) return c.json({ error: "rating is required" }, 400);

  const db = getDb(c.env.DB);
  const goal = await db.select({ goal: kraGoals, employee: employees }).from(kraGoals).innerJoin(employees, eq(kraGoals.employeeId, employees.id)).where(eq(kraGoals.id, goalId)).get();
  if (!goal) return c.json({ error: "Not found" }, 404);
  if (goal.employee.reportingManagerId !== session.employeeId && !session.perms.includes("kra.view_all")) {
    return c.json({ error: "Forbidden" }, 403);
  }

  const updated = await upsertRating(db, goalId, { managerRating: body.rating, comments: body.comments, ratedByUserId: session.sub, ratedAt: new Date().toISOString() });
  return c.json(updated);
});

app.put("/goals/:id/final-rating", requirePermission("kra.view_all"), async (c) => {
  const session = c.get("session");
  const goalId = Number(c.req.param("id"));
  const body = await c.req.json<{ rating?: number }>();
  if (body.rating === undefined) return c.json({ error: "rating is required" }, 400);

  const db = getDb(c.env.DB);
  const updated = await upsertRating(db, goalId, { finalRating: body.rating, ratedByUserId: session.sub, ratedAt: new Date().toISOString() });
  return c.json(updated);
});

export default app;
