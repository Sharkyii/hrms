import { Hono } from "hono";
import { and, eq, gte, lte, inArray } from "drizzle-orm";
import { getDb } from "../db/client";
import {
  attendanceRecords,
  employees,
  officeNetworks,
  workSites,
  employeeSiteAssignments,
  attendanceMethodValues,
} from "../db/schema";
import { requireAuth, requirePermission } from "../middleware/auth";
import { distanceMeters, scoreAttendance } from "../lib/confidence";
import type { Env } from "../types";

const app = new Hono<{ Bindings: Env }>();
app.use("*", requireAuth);

async function isOfficeNetwork(db: ReturnType<typeof getDb>, ip: string | null): Promise<boolean> {
  if (!ip) return false;
  const match = await db.select().from(officeNetworks).where(eq(officeNetworks.ipAddress, ip)).get();
  return !!match;
}

async function checkGeofence(
  db: ReturnType<typeof getDb>,
  employeeId: number,
  lat?: number,
  lng?: number,
): Promise<boolean | undefined> {
  if (lat === undefined || lng === undefined) return undefined;
  const assignment = await db
    .select({ site: workSites })
    .from(employeeSiteAssignments)
    .innerJoin(workSites, eq(employeeSiteAssignments.siteId, workSites.id))
    .where(eq(employeeSiteAssignments.employeeId, employeeId))
    .get();
  if (!assignment) return undefined; // no assigned site — cannot verify, treated as missing location downstream
  const dist = distanceMeters(lat, lng, assignment.site.latitude, assignment.site.longitude);
  return dist <= assignment.site.radiusMeters;
}

// Employee marks their own attendance (web punch or mobile browser punch with optional GPS).
app.post("/punch", requirePermission("attendance.mark_own"), async (c) => {
  const session = c.get("session");
  const body = await c.req.json<{
    type: "in" | "out";
    method?: string;
    latitude?: number;
    longitude?: number;
  }>();
  if (body.type !== "in" && body.type !== "out") return c.json({ error: "type must be 'in' or 'out'" }, 400);

  const method = (body.method && attendanceMethodValues.includes(body.method as never)
    ? body.method
    : body.latitude !== undefined
      ? "mobile_app"
      : "web_punch") as (typeof attendanceMethodValues)[number];

  const db = getDb(c.env.DB);
  const today = new Date().toISOString().slice(0, 10);
  const clientIp = c.req.header("cf-connecting-ip") ?? null;

  const existing = await db
    .select()
    .from(attendanceRecords)
    .where(and(eq(attendanceRecords.employeeId, session.employeeId), eq(attendanceRecords.date, today)))
    .get();

  const onOfficeNetwork = method === "web_punch" ? await isOfficeNetwork(db, clientIp) : undefined;
  const withinGeofence =
    method === "mobile_app" ? await checkGeofence(db, session.employeeId, body.latitude, body.longitude) : undefined;

  const missingCounterpartPunch = body.type === "out" && !existing?.punchInAt;
  const score = scoreAttendance({
    method,
    onOfficeNetwork,
    withinGeofence,
    hasLocation: body.latitude !== undefined && body.longitude !== undefined,
    missingCounterpartPunch,
  });

  const nowIso = new Date().toISOString();

  if (!existing) {
    const created = await db
      .insert(attendanceRecords)
      .values({
        employeeId: session.employeeId,
        date: today,
        punchInAt: body.type === "in" ? nowIso : null,
        punchOutAt: body.type === "out" ? nowIso : null,
        method,
        confidence: score.confidence,
        status: score.status,
        latitude: body.latitude ?? null,
        longitude: body.longitude ?? null,
        withinGeofence: withinGeofence ?? null,
        flagReason: score.flagReason,
      })
      .returning()
      .get();
    return c.json(created, 201);
  }

  const patch: Partial<typeof attendanceRecords.$inferInsert> = {
    updatedAt: nowIso,
    method,
    confidence: score.confidence,
    status: score.status,
    flagReason: score.flagReason,
    latitude: body.latitude ?? existing.latitude,
    longitude: body.longitude ?? existing.longitude,
    withinGeofence: withinGeofence ?? existing.withinGeofence,
  };
  if (body.type === "in") patch.punchInAt = nowIso;
  if (body.type === "out") patch.punchOutAt = nowIso;

  const updated = await db
    .update(attendanceRecords)
    .set(patch)
    .where(eq(attendanceRecords.id, existing.id))
    .returning()
    .get();
  return c.json(updated);
});

app.get("/", async (c) => {
  const session = c.get("session");
  const db = getDb(c.env.DB);
  const from = c.req.query("from");
  const to = c.req.query("to");
  // ?self=true forces "my own records only" even for someone who could otherwise see everyone —
  // used by the personal punch widget, which must never show a mix of the whole org's attendance.
  const selfOnly = c.req.query("self") === "true";

  const dateFilters = [];
  if (from) dateFilters.push(gte(attendanceRecords.date, from));
  if (to) dateFilters.push(lte(attendanceRecords.date, to));

  if (!selfOnly && session.perms.includes("attendance.view_all")) {
    return c.json(await db.select().from(attendanceRecords).where(and(...dateFilters)).all());
  }
  if (!selfOnly && session.perms.includes("attendance.view_team")) {
    const team = await db.select({ id: employees.id }).from(employees).where(eq(employees.reportingManagerId, session.employeeId)).all();
    const ids = [...team.map((t) => t.id), session.employeeId];
    return c.json(
      await db
        .select()
        .from(attendanceRecords)
        .where(and(inArray(attendanceRecords.employeeId, ids), ...dateFilters))
        .all(),
    );
  }
  return c.json(
    await db
      .select()
      .from(attendanceRecords)
      .where(and(eq(attendanceRecords.employeeId, session.employeeId), ...dateFilters))
      .all(),
  );
});

// Exceptions queue: records held for manager review, scoped to the manager's own team (or all, for HR).
app.get("/exceptions", requirePermission("attendance.approve_team"), async (c) => {
  const session = c.get("session");
  const db = getDb(c.env.DB);

  if (session.perms.includes("attendance.approve_final")) {
    return c.json(
      await db.select().from(attendanceRecords).where(eq(attendanceRecords.status, "pending_manager")).all(),
    );
  }
  const team = await db.select({ id: employees.id }).from(employees).where(eq(employees.reportingManagerId, session.employeeId)).all();
  const ids = team.map((t) => t.id);
  if (ids.length === 0) return c.json([]);
  return c.json(
    await db
      .select()
      .from(attendanceRecords)
      .where(and(inArray(attendanceRecords.employeeId, ids), eq(attendanceRecords.status, "pending_manager")))
      .all(),
  );
});

app.put("/:id/approve", requirePermission("attendance.approve_team"), async (c) => {
  const session = c.get("session");
  const id = Number(c.req.param("id"));
  const db = getDb(c.env.DB);

  const record = await db
    .select({ attendance: attendanceRecords, employee: employees })
    .from(attendanceRecords)
    .innerJoin(employees, eq(attendanceRecords.employeeId, employees.id))
    .where(eq(attendanceRecords.id, id))
    .get();
  if (!record) return c.json({ error: "Not found" }, 404);

  const isTheirManager = record.employee.reportingManagerId === session.employeeId;
  const isFinalApprover = session.perms.includes("attendance.approve_final") || session.perms.includes("attendance.override");
  if (!isTheirManager && !isFinalApprover) return c.json({ error: "Forbidden" }, 403);

  const updated = await db
    .update(attendanceRecords)
    .set({ status: "approved", approvedByUserId: session.sub, approvedAt: new Date().toISOString(), updatedAt: new Date().toISOString() })
    .where(eq(attendanceRecords.id, id))
    .returning()
    .get();
  return c.json(updated);
});

app.put("/:id/reject", requirePermission("attendance.approve_team"), async (c) => {
  const session = c.get("session");
  const id = Number(c.req.param("id"));
  const body = await c.req.json<{ reason?: string }>();
  const db = getDb(c.env.DB);

  const updated = await db
    .update(attendanceRecords)
    .set({
      status: "rejected",
      flagReason: body.reason ?? "Rejected by approver",
      approvedByUserId: session.sub,
      approvedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    })
    .where(eq(attendanceRecords.id, id))
    .returning()
    .get();
  if (!updated) return c.json({ error: "Not found" }, 404);
  return c.json(updated);
});

export default app;
