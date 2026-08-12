import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { getDb } from "../db/client";
import { roles, users, accessAuditLog } from "../db/schema";
import { recordAccessChange } from "../lib/audit";
import { requireAuth, requirePermission } from "../middleware/auth";
import type { Env } from "../types";

const ROLE_NAMES = ["founder", "hr", "manager", "employee"] as const;

const app = new Hono<{ Bindings: Env }>();
app.use("*", requireAuth);

app.get("/", async (c) => {
  const db = getDb(c.env.DB);
  return c.json(await db.select().from(roles).all());
});

// One-click role assignment: HR/Founder pick a role for a user; permissions come from the role, not the person.
app.put("/users/:userId/role", requirePermission("employee.manage"), async (c) => {
  const session = c.get("session");
  const targetUserId = Number(c.req.param("userId"));
  const body = await c.req.json<{ role?: string; reason?: string }>();
  if (!body.role || !ROLE_NAMES.includes(body.role as (typeof ROLE_NAMES)[number])) {
    return c.json({ error: `role must be one of ${ROLE_NAMES.join(", ")}` }, 400);
  }
  const requestedRole = body.role as (typeof ROLE_NAMES)[number];

  const db = getDb(c.env.DB);
  const target = await db
    .select({ user: users, role: roles })
    .from(users)
    .innerJoin(roles, eq(users.roleId, roles.id))
    .where(eq(users.id, targetUserId))
    .get();
  if (!target) return c.json({ error: "User not found" }, 404);

  const newRole = await db.select().from(roles).where(eq(roles.name, requestedRole)).get();
  if (!newRole) return c.json({ error: "Unknown role" }, 400);

  const touchesFounderAccess = target.role.name === "founder" || newRole.name === "founder";
  if (touchesFounderAccess && session.role !== "founder") {
    return c.json({ error: "Only a founder can change founder-level access" }, 403);
  }
  if (targetUserId === session.sub) {
    return c.json({ error: "Cannot change your own role" }, 403);
  }

  await db.update(users).set({ roleId: newRole.id }).where(eq(users.id, targetUserId)).run();
  await recordAccessChange(db, {
    actorUserId: session.sub,
    targetUserId,
    fieldChanged: "role",
    oldValue: target.role.name,
    newValue: newRole.name,
    reason: body.reason,
  });

  return c.json({ userId: targetUserId, role: newRole.name });
});

// Lists all provisioned logins with their role — lets the UI map an employee to a user/role for assignment.
app.get("/users", requirePermission("employee.manage"), async (c) => {
  const db = getDb(c.env.DB);
  const rows = await db
    .select({ id: users.id, employeeId: users.employeeId, email: users.email, role: roles.name })
    .from(users)
    .innerJoin(roles, eq(users.roleId, roles.id))
    .all();
  return c.json(rows);
});

app.get("/audit-log", requirePermission("employee.manage"), async (c) => {
  const db = getDb(c.env.DB);
  return c.json(await db.select().from(accessAuditLog).all());
});

export default app;
