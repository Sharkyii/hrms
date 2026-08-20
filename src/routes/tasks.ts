import { Hono } from "hono";
import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "../db/client";
import type { Db } from "../db/client";
import { tasks, taskRatings, employees } from "../db/schema";
import { requireAuth } from "../middleware/auth";
import type { SessionPayload } from "../middleware/auth";
import type { Env } from "../types";

const app = new Hono<{ Bindings: Env }>();
app.use("*", requireAuth);

const createTaskSchema = z.object({
  title: z.string().trim().min(1),
  description: z.string().trim().min(1).optional(),
  assignedToEmployeeId: z.number().int().positive(),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

// Whoever manages this employee's KRA can see + give the rating on their tasks: their reporting
// manager, or anyone with company-wide KRA visibility (HR/founder). Same rule the rest of the
// app already uses for KRA goals — reused here rather than inventing a separate mentor concept.
async function isMentorOf(db: Db, session: SessionPayload, employeeId: number): Promise<boolean> {
  if (session.perms.includes("kra.view_all")) return true;
  if (!session.perms.includes("kra.rate_team")) return false;
  const target = await db.select().from(employees).where(eq(employees.id, employeeId)).get();
  return target?.reportingManagerId === session.employeeId;
}

app.post("/", async (c) => {
  const session = c.get("session");
  const parsed = createTaskSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, 400);
  const db = getDb(c.env.DB);

  const target = await db.select().from(employees).where(eq(employees.id, parsed.data.assignedToEmployeeId)).get();
  if (!target) return c.json({ error: "Assignee not found" }, 404);

  const created = await db
    .insert(tasks)
    .values({
      title: parsed.data.title,
      description: parsed.data.description ?? null,
      assignedByEmployeeId: session.employeeId,
      assignedToEmployeeId: parsed.data.assignedToEmployeeId,
      dueDate: parsed.data.dueDate ?? null,
    })
    .returning()
    .get();
  return c.json(created, 201);
});

// The board is company-wide — everyone sees every task. Ratings are attached only for viewers
// permitted to see that specific task's rating (the assignee themselves, or their mentor).
app.get("/", async (c) => {
  const session = c.get("session");
  const db = getDb(c.env.DB);

  const allTasks = await db.select().from(tasks).orderBy(desc(tasks.createdAt)).all();
  const allEmployees = await db.select().from(employees).all();
  const allRatings = await db.select().from(taskRatings).all();
  const empName = (id: number) => allEmployees.find((e) => e.id === id)?.fullName ?? `#${id}`;

  const canViewAll = session.perms.includes("kra.view_all");
  const rows = await Promise.all(
    allTasks.map(async (t) => {
      const rating = allRatings.find((r) => r.taskId === t.id) ?? null;
      const canSeeRating = canViewAll || t.assignedToEmployeeId === session.employeeId || (await isMentorOf(db, session, t.assignedToEmployeeId));
      return {
        id: t.id,
        title: t.title,
        description: t.description,
        assignedByEmployeeId: t.assignedByEmployeeId,
        assignedByName: empName(t.assignedByEmployeeId),
        assignedToEmployeeId: t.assignedToEmployeeId,
        assignedToName: empName(t.assignedToEmployeeId),
        dueDate: t.dueDate,
        status: t.status,
        createdAt: t.createdAt,
        completedAt: t.completedAt,
        rating: canSeeRating && rating ? { rating: rating.rating, comments: rating.comments, ratedAt: rating.ratedAt } : null,
      };
    }),
  );
  return c.json(rows);
});

app.put("/:id/status", async (c) => {
  const session = c.get("session");
  const id = Number(c.req.param("id"));
  const body = await c.req.json<{ status?: "open" | "in_progress" | "done" }>();
  if (!body.status || !["open", "in_progress", "done"].includes(body.status)) {
    return c.json({ error: "status must be open, in_progress, or done" }, 400);
  }
  const db = getDb(c.env.DB);
  const task = await db.select().from(tasks).where(eq(tasks.id, id)).get();
  if (!task) return c.json({ error: "Not found" }, 404);
  if (task.assignedToEmployeeId !== session.employeeId) return c.json({ error: "Only the assignee can update task status" }, 403);

  const updated = await db
    .update(tasks)
    .set({ status: body.status, completedAt: body.status === "done" ? new Date().toISOString() : null })
    .where(eq(tasks.id, id))
    .returning()
    .get();
  return c.json(updated);
});

app.put("/:id/rate", async (c) => {
  const session = c.get("session");
  const id = Number(c.req.param("id"));
  const body = await c.req.json<{ rating?: number; comments?: string }>();
  if (body.rating === undefined || body.rating < 1 || body.rating > 5) {
    return c.json({ error: "rating must be between 1 and 5" }, 400);
  }
  const db = getDb(c.env.DB);
  const task = await db.select().from(tasks).where(eq(tasks.id, id)).get();
  if (!task) return c.json({ error: "Not found" }, 404);
  if (task.status !== "done") return c.json({ error: "Task must be marked done before it can be rated" }, 400);
  if (!(await isMentorOf(db, session, task.assignedToEmployeeId))) return c.json({ error: "Forbidden" }, 403);

  const existing = await db.select().from(taskRatings).where(eq(taskRatings.taskId, id)).get();
  const saved = existing
    ? await db
        .update(taskRatings)
        .set({ rating: body.rating, comments: body.comments ?? null, ratedByUserId: session.sub, ratedAt: new Date().toISOString() })
        .where(eq(taskRatings.id, existing.id))
        .returning()
        .get()
    : await db
        .insert(taskRatings)
        .values({ taskId: id, rating: body.rating, comments: body.comments ?? null, ratedByUserId: session.sub })
        .returning()
        .get();
  return c.json(saved);
});

export default app;
