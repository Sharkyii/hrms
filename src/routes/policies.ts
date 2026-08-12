import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { getDb } from "../db/client";
import { policies } from "../db/schema";
import { requireAuth, requirePermission } from "../middleware/auth";
import type { Env } from "../types";

const app = new Hono<{ Bindings: Env }>();
app.use("*", requireAuth);
app.use("*", requirePermission("policies.view"));

app.get("/", async (c) => {
  const db = getDb(c.env.DB);
  return c.json(await db.select().from(policies).all());
});

app.post("/", requirePermission("policies.manage"), async (c) => {
  const body = await c.req.json<{ title?: string; content?: string; category?: string }>();
  if (!body.title || !body.content) return c.json({ error: "title and content are required" }, 400);
  const db = getDb(c.env.DB);
  const created = await db.insert(policies).values({ title: body.title, content: body.content, category: body.category ?? null }).returning().get();
  return c.json(created, 201);
});

app.put("/:id", requirePermission("policies.manage"), async (c) => {
  const id = Number(c.req.param("id"));
  const body = await c.req.json<{ title?: string; content?: string; category?: string }>();
  const db = getDb(c.env.DB);
  const existing = await db.select().from(policies).where(eq(policies.id, id)).get();
  if (!existing) return c.json({ error: "Not found" }, 404);

  const updated = await db
    .update(policies)
    .set({
      title: body.title ?? existing.title,
      content: body.content ?? existing.content,
      category: body.category ?? existing.category,
      version: existing.version + 1,
      publishedAt: new Date().toISOString(),
    })
    .where(eq(policies.id, id))
    .returning()
    .get();
  return c.json(updated);
});

export default app;
