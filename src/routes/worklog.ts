import { Hono } from "hono";
import { eq, desc } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "../db/client";
import { employees, workLogEntries } from "../db/schema";
import { requireAuth } from "../middleware/auth";
import type { Env } from "../types";

const app = new Hono<{ Bindings: Env }>();
app.use("*", requireAuth);

const createEntrySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "date must be YYYY-MM-DD"),
  tasks: z.string().trim().min(1),
});

// Self-reported only — an employee logs their own work, nobody logs it for them.
app.post("/", async (c) => {
  const session = c.get("session");
  const parsed = createEntrySchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, 400);
  const db = getDb(c.env.DB);
  const created = await db
    .insert(workLogEntries)
    .values({ employeeId: session.employeeId, date: parsed.data.date, tasks: parsed.data.tasks })
    .returning()
    .get();
  return c.json(created, 201);
});

app.get("/", async (c) => {
  const session = c.get("session");
  const db = getDb(c.env.DB);
  const employeeIdParam = c.req.query("employeeId");
  const targetId = employeeIdParam ? Number(employeeIdParam) : session.employeeId;

  if (targetId !== session.employeeId) {
    const target = await db.select().from(employees).where(eq(employees.id, targetId)).get();
    const canViewAll = session.perms.includes("employee.view_all");
    const canViewTeam = session.perms.includes("employee.view_team") && target?.reportingManagerId === session.employeeId;
    if (!canViewAll && !canViewTeam) return c.json({ error: "Forbidden" }, 403);
  }

  const rows = await db
    .select()
    .from(workLogEntries)
    .where(eq(workLogEntries.employeeId, targetId))
    .orderBy(desc(workLogEntries.date), desc(workLogEntries.id))
    .limit(30)
    .all();
  return c.json(rows);
});

export default app;
