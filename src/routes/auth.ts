import { Hono } from "hono";
import { setCookie, deleteCookie } from "hono/cookie";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "../db/client";
import { users, roles, employees } from "../db/schema";
import { hashPassword, signJwt, verifyPassword } from "../lib/crypto";
import { ROLE_PERMISSIONS } from "../lib/permissions";
import { requireAuth, SESSION_COOKIE, type SessionPayload } from "../middleware/auth";
import type { Env } from "../types";

const app = new Hono<{ Bindings: Env }>();
const SESSION_TTL_SECONDS = 12 * 60 * 60;

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1),
});

app.post("/login", async (c) => {
  const parsed = loginSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json({ error: "Email and a password are required" }, 400);
  const { email, password } = parsed.data;

  const db = getDb(c.env.DB);
  const row = await db
    .select({ user: users, role: roles })
    .from(users)
    .innerJoin(roles, eq(users.roleId, roles.id))
    .where(eq(users.email, email))
    .get();

  if (!row) return c.json({ error: "Invalid email or password" }, 401);

  const ok = await verifyPassword(password, row.user.passwordSalt, row.user.passwordHash);
  if (!ok) return c.json({ error: "Invalid email or password" }, 401);

  const roleName = row.role.name as SessionPayload["role"];
  const payload: SessionPayload = {
    sub: row.user.id,
    employeeId: row.user.employeeId,
    role: roleName,
    perms: ROLE_PERMISSIONS[roleName],
  };
  const token = await signJwt(payload, c.env.JWT_SECRET, SESSION_TTL_SECONDS);

  setCookie(c, SESSION_COOKIE, token, {
    httpOnly: true,
    secure: true,
    sameSite: "Lax",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });

  await db.update(users).set({ lastLoginAt: new Date().toISOString() }).where(eq(users.id, row.user.id)).run();

  return c.json({ role: roleName, employeeId: row.user.employeeId });
});

app.post("/logout", (c) => {
  deleteCookie(c, SESSION_COOKIE, { path: "/" });
  return c.json({ ok: true });
});

app.get("/me", requireAuth, async (c) => {
  const session = c.get("session");
  const db = getDb(c.env.DB);
  const employee = await db.select().from(employees).where(eq(employees.id, session.employeeId)).get();
  return c.json({ session, employee });
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8, "New password must be at least 8 characters"),
});

app.post("/change-password", requireAuth, async (c) => {
  const session = c.get("session");
  const parsed = changePasswordSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, 400);
  const { currentPassword, newPassword } = parsed.data;

  const db = getDb(c.env.DB);
  const user = await db.select().from(users).where(eq(users.id, session.sub)).get();
  if (!user) return c.json({ error: "Not found" }, 404);

  const ok = await verifyPassword(currentPassword, user.passwordSalt, user.passwordHash);
  if (!ok) return c.json({ error: "Current password is incorrect" }, 401);

  const { hash, salt } = await hashPassword(newPassword);
  await db.update(users).set({ passwordHash: hash, passwordSalt: salt }).where(eq(users.id, session.sub)).run();

  return c.json({ ok: true });
});

const provisionSchema = z.object({
  employeeId: z.number().int().positive(),
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(8, "Password must be at least 8 characters"),
  role: z.enum(["founder", "hr", "manager", "employee"]),
});

// HR/Founder-only: create a login for an existing employee record (no public signup — accounts are provisioned by HR).
app.post("/provision", requireAuth, async (c) => {
  const session = c.get("session");
  if (!session.perms.includes("employee.manage")) return c.json({ error: "Forbidden" }, 403);

  const parsed = provisionSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, 400);
  const body = parsed.data;
  if (body.role === "founder" && session.role !== "founder") {
    return c.json({ error: "Only a founder can grant the founder role" }, 403);
  }

  const db = getDb(c.env.DB);
  const role = await db.select().from(roles).where(eq(roles.name, body.role)).get();
  if (!role) return c.json({ error: "Unknown role" }, 400);

  const { hash, salt } = await hashPassword(body.password);
  const created = await db
    .insert(users)
    .values({
      employeeId: body.employeeId,
      email: body.email,
      passwordHash: hash,
      passwordSalt: salt,
      roleId: role.id,
    })
    .returning()
    .get();

  return c.json({ id: created.id, email: created.email, role: body.role }, 201);
});

export default app;
