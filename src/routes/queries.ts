import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { getDb } from "../db/client";
import { employeeQueries } from "../db/schema";
import { requireAuth, requirePermission } from "../middleware/auth";
import type { Env } from "../types";

const app = new Hono<{ Bindings: Env }>();
app.use("*", requireAuth);

app.post("/", requirePermission("queries.raise"), async (c) => {
  const session = c.get("session");
  const body = await c.req.json<{ category?: string; subject?: string; description?: string }>();
  if (!body.category || !body.subject) return c.json({ error: "category and subject are required" }, 400);
  const db = getDb(c.env.DB);
  const created = await db
    .insert(employeeQueries)
    .values({ employeeId: session.employeeId, category: body.category, subject: body.subject, description: body.description ?? null })
    .returning()
    .get();
  return c.json(created, 201);
});

app.get("/", async (c) => {
  const session = c.get("session");
  const db = getDb(c.env.DB);
  if (session.perms.includes("queries.manage")) return c.json(await db.select().from(employeeQueries).all());
  return c.json(await db.select().from(employeeQueries).where(eq(employeeQueries.employeeId, session.employeeId)).all());
});

app.put("/:id", requirePermission("queries.manage"), async (c) => {
  const id = Number(c.req.param("id"));
  const body = await c.req.json<{ status?: "open" | "in_progress" | "resolved" | "closed"; assignedToUserId?: number }>();
  const db = getDb(c.env.DB);
  const patch: Partial<typeof employeeQueries.$inferInsert> = {};
  if (body.status) {
    patch.status = body.status;
    if (body.status === "resolved" || body.status === "closed") patch.resolvedAt = new Date().toISOString();
  }
  if (body.assignedToUserId) patch.assignedToUserId = body.assignedToUserId;

  const updated = await db.update(employeeQueries).set(patch).where(eq(employeeQueries.id, id)).returning().get();
  if (!updated) return c.json({ error: "Not found" }, 404);
  return c.json(updated);
});

export default app;
