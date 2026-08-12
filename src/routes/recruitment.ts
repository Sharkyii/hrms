import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { getDb } from "../db/client";
import { jobPostings, candidates, interviews } from "../db/schema";
import { requireAuth, requirePermission } from "../middleware/auth";
import type { Env } from "../types";

const app = new Hono<{ Bindings: Env }>();
app.use("*", requireAuth);
app.use("*", requirePermission("recruitment.manage"));

app.get("/job-postings", async (c) => {
  const db = getDb(c.env.DB);
  return c.json(await db.select().from(jobPostings).all());
});

app.post("/job-postings", async (c) => {
  const body = await c.req.json<{ title?: string; department?: string; openings?: number; description?: string }>();
  if (!body.title) return c.json({ error: "title is required" }, 400);
  const db = getDb(c.env.DB);
  const created = await db
    .insert(jobPostings)
    .values({ title: body.title, department: body.department ?? null, openings: body.openings ?? 1, description: body.description ?? null })
    .returning()
    .get();
  return c.json(created, 201);
});

app.get("/candidates", async (c) => {
  const db = getDb(c.env.DB);
  const jobPostingId = c.req.query("jobPostingId");
  if (jobPostingId) return c.json(await db.select().from(candidates).where(eq(candidates.jobPostingId, Number(jobPostingId))).all());
  return c.json(await db.select().from(candidates).all());
});

app.post("/candidates", async (c) => {
  const body = await c.req.json<{ jobPostingId?: number; name?: string; email?: string; phone?: string; source?: string }>();
  if (!body.jobPostingId || !body.name || !body.email) return c.json({ error: "jobPostingId, name, and email are required" }, 400);
  const db = getDb(c.env.DB);
  const created = await db
    .insert(candidates)
    .values({ jobPostingId: body.jobPostingId, name: body.name, email: body.email, phone: body.phone ?? null, source: body.source ?? null })
    .returning()
    .get();
  return c.json(created, 201);
});

app.put("/candidates/:id/stage", async (c) => {
  const id = Number(c.req.param("id"));
  const body = await c.req.json<{ stage?: string }>();
  const validStages = ["applied", "screening", "interview", "offer", "hired", "rejected"] as const;
  if (!body.stage || !validStages.includes(body.stage as (typeof validStages)[number])) {
    return c.json({ error: `stage must be one of ${validStages.join(", ")}` }, 400);
  }
  const stage = body.stage as (typeof validStages)[number];
  const db = getDb(c.env.DB);
  const updated = await db.update(candidates).set({ stage }).where(eq(candidates.id, id)).returning().get();
  if (!updated) return c.json({ error: "Not found" }, 404);
  return c.json(updated);
});

app.post("/interviews", async (c) => {
  const body = await c.req.json<{ candidateId?: number; round?: number; interviewerUserId?: number; scheduledAt?: string }>();
  if (!body.candidateId) return c.json({ error: "candidateId is required" }, 400);
  const db = getDb(c.env.DB);
  const created = await db
    .insert(interviews)
    .values({ candidateId: body.candidateId, round: body.round ?? 1, interviewerUserId: body.interviewerUserId ?? null, scheduledAt: body.scheduledAt ?? null })
    .returning()
    .get();
  return c.json(created, 201);
});

app.put("/interviews/:id/feedback", async (c) => {
  const id = Number(c.req.param("id"));
  const body = await c.req.json<{ feedback?: string; rating?: number }>();
  const db = getDb(c.env.DB);
  const updated = await db.update(interviews).set({ feedback: body.feedback, rating: body.rating }).where(eq(interviews.id, id)).returning().get();
  if (!updated) return c.json({ error: "Not found" }, 404);
  return c.json(updated);
});

export default app;
