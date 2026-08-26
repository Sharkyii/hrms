import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

export const employeeTypeValues = [
  "office_laptop",
  "office_no_laptop",
  "field",
  "wfh",
  "no_smartphone",
  "contract",
] as const;

export const employeeCategoryValues = ["skilled", "semi_skilled", "unskilled"] as const;

export const employees = sqliteTable("employees", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  employeeCode: text("employee_code").notNull().unique(),
  fullName: text("full_name").notNull(),
  email: text("email").notNull().unique(),
  phone: text("phone"),
  employeeType: text("employee_type", { enum: employeeTypeValues }).notNull(),
  department: text("department"),
  designation: text("designation"),
  category: text("category", { enum: employeeCategoryValues }),
  reportingManagerId: integer("reporting_manager_id"),
  dateOfJoining: text("date_of_joining").notNull(),
  // Defaults to 3 months after joining but is editable — probation can be extended per the handbook.
  confirmationDate: text("confirmation_date"),
  // "offboarding" removes a person from active workflows while their clearance and
  // final settlement are still in progress.
  status: text("status", { enum: ["active", "offboarding", "exited"] }).notNull().default("active"),
  createdAt: text("created_at").notNull().default(sql`(current_timestamp)`),
  updatedAt: text("updated_at").notNull().default(sql`(current_timestamp)`),
});

export const roles = sqliteTable("roles", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name", { enum: ["founder", "hr", "manager", "employee"] }).notNull().unique(),
  description: text("description"),
});

export const permissions = sqliteTable("permissions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  key: text("key").notNull().unique(),
  description: text("description"),
});

export const rolePermissions = sqliteTable("role_permissions", {
  roleId: integer("role_id").notNull().references(() => roles.id),
  permissionId: integer("permission_id").notNull().references(() => permissions.id),
});

export const users = sqliteTable("users", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  employeeId: integer("employee_id").notNull().references(() => employees.id).unique(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  passwordSalt: text("password_salt").notNull(),
  roleId: integer("role_id").notNull().references(() => roles.id),
  lastLoginAt: text("last_login_at"),
  createdAt: text("created_at").notNull().default(sql`(current_timestamp)`),
});

export const accessAuditLog = sqliteTable("access_audit_log", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  actorUserId: integer("actor_user_id").notNull().references(() => users.id),
  targetUserId: integer("target_user_id").notNull().references(() => users.id),
  fieldChanged: text("field_changed").notNull(),
  oldValue: text("old_value"),
  newValue: text("new_value"),
  reason: text("reason"),
  changedAt: text("changed_at").notNull().default(sql`(current_timestamp)`),
});

// Generic correction audit used by attendance/payroll modules (who/when/old/new/reason).
export const correctionAuditLog = sqliteTable("correction_audit_log", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  entityType: text("entity_type").notNull(),
  entityId: integer("entity_id").notNull(),
  actorUserId: integer("actor_user_id").notNull().references(() => users.id),
  fieldChanged: text("field_changed").notNull(),
  oldValue: text("old_value"),
  newValue: text("new_value"),
  reason: text("reason"),
  changedAt: text("changed_at").notNull().default(sql`(current_timestamp)`),
});
