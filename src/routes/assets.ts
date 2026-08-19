import { Hono } from "hono";
import { eq, isNull } from "drizzle-orm";
import { getDb } from "../db/client";
import { assets, assetAssignments, employees } from "../db/schema";
import { requireAuth, requirePermission } from "../middleware/auth";
import type { Env } from "../types";

const app = new Hono<{ Bindings: Env }>();
app.use("*", requireAuth);

app.get("/", async (c) => {
  const session = c.get("session");
  const db = getDb(c.env.DB);
  if (session.perms.includes("assets.manage")) {
    const allAssets = await db.select().from(assets).all();
    const openAssignments = await db
      .select({ assignment: assetAssignments, employee: employees })
      .from(assetAssignments)
      .innerJoin(employees, eq(assetAssignments.employeeId, employees.id))
      .where(isNull(assetAssignments.returnedAt))
      .all();
    const byAssetId = new Map(openAssignments.map((a) => [a.assignment.assetId, a.employee]));
    return c.json(
      allAssets.map((a) => ({
        ...a,
        assignedToEmployeeId: byAssetId.get(a.id)?.id ?? null,
        assignedToName: byAssetId.get(a.id)?.fullName ?? null,
      })),
    );
  }

  const rows = await db
    .select({ asset: assets, assignment: assetAssignments })
    .from(assetAssignments)
    .innerJoin(assets, eq(assetAssignments.assetId, assets.id))
    .where(eq(assetAssignments.employeeId, session.employeeId))
    .all();
  return c.json(rows.map((r) => r.asset));
});

app.post("/", requirePermission("assets.manage"), async (c) => {
  const body = await c.req.json<{ assetCode?: string; name?: string; category?: string; purchaseDate?: string }>();
  if (!body.assetCode || !body.name) return c.json({ error: "assetCode and name are required" }, 400);
  const db = getDb(c.env.DB);
  const created = await db
    .insert(assets)
    .values({ assetCode: body.assetCode, name: body.name, category: body.category ?? null, purchaseDate: body.purchaseDate ?? null })
    .returning()
    .get();
  return c.json(created, 201);
});

app.post("/:id/assign", requirePermission("assets.manage"), async (c) => {
  const assetId = Number(c.req.param("id"));
  const body = await c.req.json<{ employeeId?: number }>();
  if (!body.employeeId) return c.json({ error: "employeeId is required" }, 400);
  const db = getDb(c.env.DB);

  const asset = await db.select().from(assets).where(eq(assets.id, assetId)).get();
  if (!asset) return c.json({ error: "Not found" }, 404);
  if (asset.status === "assigned") return c.json({ error: "Asset already assigned" }, 409);

  const assignment = await db.insert(assetAssignments).values({ assetId, employeeId: body.employeeId }).returning().get();
  await db.update(assets).set({ status: "assigned" }).where(eq(assets.id, assetId)).run();
  return c.json(assignment, 201);
});

app.post("/:id/return", requirePermission("assets.manage"), async (c) => {
  const assetId = Number(c.req.param("id"));
  const body = await c.req.json<{ conditionNotes?: string }>();
  const db = getDb(c.env.DB);

  const assignment = await db
    .select()
    .from(assetAssignments)
    .where(eq(assetAssignments.assetId, assetId))
    .all();
  const open = assignment.find((a) => !a.returnedAt);
  if (!open) return c.json({ error: "No open assignment for this asset" }, 404);

  await db.update(assetAssignments).set({ returnedAt: new Date().toISOString(), conditionNotes: body.conditionNotes ?? null }).where(eq(assetAssignments.id, open.id)).run();
  await db.update(assets).set({ status: "available" }).where(eq(assets.id, assetId)).run();
  return c.json({ ok: true });
});

export default app;
