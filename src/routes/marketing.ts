import { Hono } from "hono";
import { eq, desc } from "drizzle-orm";
import { getDb } from "../db/client";
import { retailerVisits, employees } from "../db/schema";
import { requireAuth, requirePermission } from "../middleware/auth";
import type { Env } from "../types";

const app = new Hono<{ Bindings: Env }>();
app.use("*", requireAuth);

app.get("/visits", async (c) => {
  const session = c.get("session");
  const db = getDb(c.env.DB);
  
  const canViewAll = session.perms.includes("employee.manage") || session.perms.includes("employee.view_all");
  
  const visits = await db
    .select({ visit: retailerVisits, employee: employees })
    .from(retailerVisits)
    .innerJoin(employees, eq(retailerVisits.employeeId, employees.id))
    .orderBy(desc(retailerVisits.createdAt))
    .all();
    
  if (canViewAll) {
    return c.json(visits);
  }
  
  const myVisits = visits.filter(v => v.visit.employeeId === session.employeeId);
  return c.json(myVisits);
});

app.post("/visits", async (c) => {
  const session = c.get("session");
  const db = getDb(c.env.DB);
  
  const form = await c.req.formData().catch(() => null);
  if (!form) return c.json({ error: "Invalid form data" }, 400);
  
  const shopName = form.get("shopName")?.toString();
  const area = form.get("area")?.toString();
  const contractedAmount = Number(form.get("contractedAmount"));
  const latitude = form.get("latitude") ? Number(form.get("latitude")) : null;
  const longitude = form.get("longitude") ? Number(form.get("longitude")) : null;
  const photo = form.get("photo");
  
  if (!shopName || !area || isNaN(contractedAmount) || !(photo instanceof File)) {
    return c.json({ error: "Missing required fields" }, 400);
  }

  const r2Key = `marketing/visits/${session.employeeId}/${Date.now()}-${photo.name}`;
  await c.env.DOCUMENTS.put(r2Key, await photo.arrayBuffer(), { httpMetadata: { contentType: photo.type || "image/jpeg" } });

  const created = await db.insert(retailerVisits).values({
    employeeId: session.employeeId,
    shopName,
    area,
    contractedAmount,
    latitude,
    longitude,
    photoR2Key: r2Key,
  }).returning().get();
  
  return c.json(created, 201);
});

app.get("/visits/:id/photo", async (c) => {
  const id = Number(c.req.param("id"));
  const db = getDb(c.env.DB);
  const visit = await db.select().from(retailerVisits).where(eq(retailerVisits.id, id)).get();
  if (!visit || !visit.photoR2Key) return c.json({ error: "Not found" }, 404);
  
  const object = await c.env.DOCUMENTS.get(visit.photoR2Key);
  if (!object) return c.json({ error: "File missing" }, 404);

  return new Response(object.body, {
    headers: {
      "Content-Type": object.httpMetadata?.contentType || "image/jpeg",
    },
  });
});

app.put("/visits/:id/status", requirePermission("employee.manage"), async (c) => {
  const session = c.get("session");
  const id = Number(c.req.param("id"));
  const { status } = await c.req.json<{ status?: "verified" | "rejected" }>();
  
  if (!status || !["verified", "rejected"].includes(status)) {
    return c.json({ error: "Invalid status" }, 400);
  }
  
  const db = getDb(c.env.DB);
  const updated = await db.update(retailerVisits).set({
    status,
    verifiedByUserId: session.sub,
    updatedAt: new Date().toISOString(),
  }).where(eq(retailerVisits.id, id)).returning().get();
  
  return c.json(updated);
});

export default app;
