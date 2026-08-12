import { Hono } from "hono";
import { eq, or } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "../db/client";
import { employees, employeeTypeValues } from "../db/schema";
import { requireAuth, requirePermission } from "../middleware/auth";
import type { Env } from "../types";

const app = new Hono<{ Bindings: Env }>();
app.use("*", requireAuth);

const createEmployeeSchema = z.object({
  employeeCode: z.string().trim().min(1),
  fullName: z.string().trim().min(1),
  email: z.string().trim().toLowerCase().email(),
  phone: z.string().trim().min(1).optional(),
  employeeType: z.enum(employeeTypeValues),
  department: z.string().trim().min(1).optional(),
  designation: z.string().trim().min(1).optional(),
  reportingManagerId: z.number().int().positive().optional(),
  dateOfJoining: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "dateOfJoining must be YYYY-MM-DD"),
});

app.get("/", async (c) => {
  const session = c.get("session");
  const db = getDb(c.env.DB);

  if (session.perms.includes("employee.view_all")) {
    return c.json(await db.select().from(employees).all());
  }
  if (session.perms.includes("employee.view_team")) {
    const rows = await db
      .select()
      .from(employees)
      .where(or(eq(employees.reportingManagerId, session.employeeId), eq(employees.id, session.employeeId)))
      .all();
    return c.json(rows);
  }
  // employee.view_own only
  const self = await db.select().from(employees).where(eq(employees.id, session.employeeId)).get();
  return c.json(self ? [self] : []);
});

app.get("/:id", async (c) => {
  const session = c.get("session");
  const id = Number(c.req.param("id"));
  const db = getDb(c.env.DB);
  const row = await db.select().from(employees).where(eq(employees.id, id)).get();
  if (!row) return c.json({ error: "Not found" }, 404);

  const canViewAll = session.perms.includes("employee.view_all");
  const canViewTeam = session.perms.includes("employee.view_team") && row.reportingManagerId === session.employeeId;
  const isSelf = row.id === session.employeeId;
  if (!canViewAll && !canViewTeam && !isSelf) return c.json({ error: "Forbidden" }, 403);

  return c.json(row);
});

app.post("/", requirePermission("employee.manage"), async (c) => {
  const parsed = createEmployeeSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, 400);
  const body = parsed.data;

  const db = getDb(c.env.DB);
  const created = await db
    .insert(employees)
    .values({
      employeeCode: body.employeeCode,
      fullName: body.fullName,
      email: body.email,
      phone: body.phone ?? null,
      employeeType: body.employeeType,
      department: body.department ?? null,
      designation: body.designation ?? null,
      reportingManagerId: body.reportingManagerId ?? null,
      dateOfJoining: body.dateOfJoining,
    })
    .returning()
    .get();

  return c.json(created, 201);
});

app.put("/:id", requirePermission("employee.manage"), async (c) => {
  const id = Number(c.req.param("id"));
  const body = await c.req.json<Record<string, unknown>>();
  const db = getDb(c.env.DB);

  const existing = await db.select().from(employees).where(eq(employees.id, id)).get();
  if (!existing) return c.json({ error: "Not found" }, 404);

  const patch: Partial<typeof employees.$inferInsert> = { updatedAt: new Date().toISOString() };
  const editable = ["fullName", "phone", "employeeType", "department", "designation", "reportingManagerId", "status"] as const;
  for (const field of editable) {
    if (field in body) (patch as Record<string, unknown>)[field] = body[field];
  }

  const updated = await db.update(employees).set(patch).where(eq(employees.id, id)).returning().get();
  return c.json(updated);
});

export default app;
