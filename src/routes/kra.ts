import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { getDb } from "../db/client";
import { kraCycles, kraGoals, kraRatings, kpiTemplates, kpiTemplateItems, employees } from "../db/schema";
import { computeKraScore } from "../lib/kra-score";
import { computeKpiScore } from "../lib/kpi-score";
import { requireAuth, requirePermission } from "../middleware/auth";
import type { Env } from "../types";

type TargetUnit = "count" | "percent" | "currency_band";

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
  const body = await c.req.json<{
    employeeId?: number;
    cycleId?: number;
    title?: string;
    weightPct?: number;
    target?: string;
    targetValue?: number;
    targetUnit?: TargetUnit;
    bandPct?: number;
  }>();
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
    .values({
      employeeId: body.employeeId,
      cycleId: body.cycleId,
      title: body.title,
      weightPct: body.weightPct,
      target: body.target ?? null,
      targetValue: body.targetValue ?? null,
      targetUnit: body.targetUnit ?? null,
      bandPct: body.bandPct ?? null,
    })
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

// Weighted score + performance category for one employee's cycle — same visibility rule as goals.
app.get("/score", async (c) => {
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

  const cycleIdParam = c.req.query("cycleId");
  let cycleId = cycleIdParam ? Number(cycleIdParam) : null;
  if (!cycleId) {
    const cycles = await db.select().from(kraCycles).all();
    cycleId = (cycles.find((cy) => cy.status === "open") ?? cycles.at(-1))?.id ?? null;
  }
  if (!cycleId) return c.json({ score: null, weightRatedPct: 0, category: null });

  const goals = await db.select().from(kraGoals).where(eq(kraGoals.employeeId, employeeId)).all();
  const cycleGoals = goals.filter((g) => g.cycleId === cycleId);
  const ratings = await db.select().from(kraRatings).all();
  const ratingsByGoalId = new Map(ratings.map((r) => [r.goalId, r]));

  return c.json(computeKraScore(cycleGoals, ratingsByGoalId));
});

// Returns the score for every employee, subject to the same view permissions (managers see their team,
// admins see all). Useful for the team scoreboard.
app.get("/team-scores", async (c) => {
  const session = c.get("session");
  const db = getDb(c.env.DB);
  
  const canViewAll = session.perms.includes("kra.view_all");
  const canRateTeam = session.perms.includes("kra.rate_team");
  
  let targetEmployees = await db.select().from(employees).where(eq(employees.status, "active")).all();
  if (!canViewAll) {
    targetEmployees = targetEmployees.filter(e => e.id === session.employeeId || (canRateTeam && e.reportingManagerId === session.employeeId));
  }

  const cycleIdParam = c.req.query("cycleId");
  let cycleId = cycleIdParam ? Number(cycleIdParam) : null;
  if (!cycleId) {
    const cycles = await db.select().from(kraCycles).all();
    cycleId = (cycles.find((cy) => cy.status === "open") ?? cycles.at(-1))?.id ?? null;
  }
  if (!cycleId) {
    return c.json(targetEmployees.map(e => ({ employeeId: e.id, score: null, weightRatedPct: 0, category: null })));
  }

  const allGoals = await db.select().from(kraGoals).where(eq(kraGoals.cycleId, cycleId)).all();
  const allRatings = await db.select().from(kraRatings).all();
  const ratingsByGoalId = new Map(allRatings.map((r) => [r.goalId, r]));
  
  const result = targetEmployees.map((emp) => {
    const cycleGoals = allGoals.filter(g => g.employeeId === emp.id);
    const score = computeKraScore(cycleGoals, ratingsByGoalId);
    return { employeeId: emp.id, ...score };
  });

  return c.json(result);
});

// Sets the Achieved value for a Target/Achieved-style goal — same "who can touch this employee's
// KRA data" rule as manager-rating, since recording actuals is a manager/HR action, not self-serve.
app.put("/goals/:id/achieved", requirePermission("kra.rate_team"), async (c) => {
  const session = c.get("session");
  const goalId = Number(c.req.param("id"));
  const body = await c.req.json<{ achievedValue?: number }>();
  if (body.achievedValue === undefined) return c.json({ error: "achievedValue is required" }, 400);

  const db = getDb(c.env.DB);
  const goal = await db.select({ goal: kraGoals, employee: employees }).from(kraGoals).innerJoin(employees, eq(kraGoals.employeeId, employees.id)).where(eq(kraGoals.id, goalId)).get();
  if (!goal) return c.json({ error: "Not found" }, 404);
  if (goal.employee.reportingManagerId !== session.employeeId && !session.perms.includes("kra.view_all")) {
    return c.json({ error: "Forbidden" }, 403);
  }

  const updated = await db.update(kraGoals).set({ achievedValue: body.achievedValue }).where(eq(kraGoals.id, goalId)).returning().get();
  return c.json(updated);
});

// Target/Achieved KPI table + weighted Overall Score for one employee's cycle — the computed
// version of the Sr.No/KPI/Target/Achieved/Score% scorecard. Same visibility rule as /score.
app.get("/kpi-score", async (c) => {
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

  const cycleIdParam = c.req.query("cycleId");
  let cycleId = cycleIdParam ? Number(cycleIdParam) : null;
  if (!cycleId) {
    const cycles = await db.select().from(kraCycles).all();
    cycleId = (cycles.find((cy) => cy.status === "open") ?? cycles.at(-1))?.id ?? null;
  }
  if (!cycleId) return c.json({ goals: [], overallScorePct: null, weightScoredPct: 0 });

  const goals = await db.select().from(kraGoals).where(eq(kraGoals.employeeId, employeeId)).all();
  const cycleGoals = goals.filter((g) => g.cycleId === cycleId);
  const result = computeKpiScore(cycleGoals);
  const scoreByGoalId = new Map(result.rows.map((r) => [r.goalId, r.scorePct]));

  return c.json({
    goals: cycleGoals.map((g) => ({ ...g, scorePct: scoreByGoalId.get(g.id) ?? null })),
    overallScorePct: result.overallScorePct,
    weightScoredPct: result.weightScoredPct,
  });
});

// --- KPI templates: a reusable per-role checklist, applied to spin up a cycle's goals in one click ---

app.get("/kpi-templates", async (c) => {
  const db = getDb(c.env.DB);
  const templates = await db.select().from(kpiTemplates).all();
  const items = await db.select().from(kpiTemplateItems).all();
  return c.json(templates.map((t) => ({ ...t, items: items.filter((i) => i.templateId === t.id).sort((a, b) => a.sortOrder - b.sortOrder) })));
});

app.post("/kpi-templates", requirePermission("kra.view_all"), async (c) => {
  const body = await c.req.json<{
    role?: string;
    items?: Array<{ title: string; weightPct: number; targetValue?: number; targetUnit?: TargetUnit; bandPct?: number }>;
  }>();
  if (!body.role || !body.items || body.items.length === 0) return c.json({ error: "role and at least one item are required" }, 400);

  const db = getDb(c.env.DB);
  const template = await db.insert(kpiTemplates).values({ role: body.role }).returning().get();
  await db.insert(kpiTemplateItems).values(
    body.items.map((item, i) => ({
      templateId: template.id,
      title: item.title,
      weightPct: item.weightPct,
      targetValue: item.targetValue ?? null,
      targetUnit: item.targetUnit ?? null,
      bandPct: item.bandPct ?? null,
      sortOrder: i,
    })),
  ).run();

  return c.json({ ok: true, templateId: template.id }, 201);
});

// Creates one kraGoal per template item for an employee/cycle — the "apply template" one-click action.
app.post("/kpi-templates/:id/apply", async (c) => {
  const session = c.get("session");
  const templateId = Number(c.req.param("id"));
  const body = await c.req.json<{ employeeId?: number; cycleId?: number }>();
  if (!body.employeeId || !body.cycleId) return c.json({ error: "employeeId and cycleId are required" }, 400);

  const db = getDb(c.env.DB);
  if (!session.perms.includes("kra.view_all")) {
    if (!session.perms.includes("kra.rate_team")) return c.json({ error: "Forbidden" }, 403);
    const target = await db.select().from(employees).where(eq(employees.id, body.employeeId)).get();
    if (!target || target.reportingManagerId !== session.employeeId) return c.json({ error: "Forbidden" }, 403);
  }

  const items = await db.select().from(kpiTemplateItems).where(eq(kpiTemplateItems.templateId, templateId)).all();
  if (items.length === 0) return c.json({ error: "Template not found or has no items" }, 404);

  const created = await db
    .insert(kraGoals)
    .values(
      items.map((item) => ({
        employeeId: body.employeeId!,
        cycleId: body.cycleId!,
        title: item.title,
        weightPct: item.weightPct,
        targetValue: item.targetValue,
        targetUnit: item.targetUnit,
        bandPct: item.bandPct,
      })),
    )
    .returning()
    .all();

  return c.json(created, 201);
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
