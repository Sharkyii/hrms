import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";
import { employees, users } from "./core";

export const exitRequests = sqliteTable("exit_requests", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  employeeId: integer("employee_id").notNull().references(() => employees.id),
  resignationDate: text("resignation_date").notNull(),
  lastWorkingDay: text("last_working_day").notNull(),
  reason: text("reason"),
  status: text("status", { enum: ["pending", "in_clearance", "settled", "cancelled"] }).notNull().default("pending"),
  createdAt: text("created_at").notNull().default(sql`(current_timestamp)`),
});

export const exitClearances = sqliteTable("exit_clearances", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  exitRequestId: integer("exit_request_id").notNull().references(() => exitRequests.id),
  department: text("department").notNull(),
  clearedByUserId: integer("cleared_by_user_id").references(() => users.id),
  clearedAt: text("cleared_at"),
  remarks: text("remarks"),
});

export const fullAndFinalSettlements = sqliteTable("full_and_final_settlements", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  exitRequestId: integer("exit_request_id").notNull().references(() => exitRequests.id),
  dues: real("dues").notNull().default(0),
  deductions: real("deductions").notNull().default(0),
  netSettlement: real("net_settlement").notNull().default(0),
  processedAt: text("processed_at"),
});
