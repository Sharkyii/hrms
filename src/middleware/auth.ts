import type { Context, Next } from "hono";
import { getCookie } from "hono/cookie";
import { verifyJwt } from "../lib/crypto";
import type { PermissionKey } from "../lib/permissions";

export interface SessionPayload {
  sub: number; // user id
  employeeId: number;
  role: "founder" | "hr" | "manager" | "employee";
  perms: PermissionKey[];
}

export const SESSION_COOKIE = "hrms_session";

declare module "hono" {
  interface ContextVariableMap {
    session: SessionPayload;
  }
}

export async function requireAuth(c: Context, next: Next) {
  const token = getCookie(c, SESSION_COOKIE);
  if (!token) return c.json({ error: "Not authenticated" }, 401);
  const secret = (c.env as { JWT_SECRET: string }).JWT_SECRET;
  const payload = await verifyJwt<SessionPayload>(token, secret);
  if (!payload) return c.json({ error: "Session expired or invalid" }, 401);
  c.set("session", payload);
  await next();
}

export function requirePermission(...keys: PermissionKey[]) {
  return async (c: Context, next: Next) => {
    const session = c.get("session");
    const hasAll = keys.every((k) => session.perms.includes(k));
    if (!hasAll) return c.json({ error: "Forbidden" }, 403);
    await next();
  };
}
