import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";
import { employees, users } from "./core";

export const kraCycles = sqliteTable("kra_cycles", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  startDate: text("start_date").notNull(),
  endDate: text("end_date").notNull(),
  status: text("status", { enum: ["open", "closed"] }).notNull().default("open"),
});

export const kraGoals = sqliteTable("kra_goals", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  employeeId: integer("employee_id").notNull().references(() => employees.id),
  cycleId: integer("cycle_id").notNull().references(() => kraCycles.id),
  title: text("title").notNull(),
  weightPct: real("weight_pct").notNull(),
  target: text("target"),
});

export const kraRatings = sqliteTable("kra_ratings", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  goalId: integer("goal_id").notNull().references(() => kraGoals.id),
  selfRating: real("self_rating"),
  managerRating: real("manager_rating"),
  finalRating: real("final_rating"),
  comments: text("comments"),
  ratedByUserId: integer("rated_by_user_id").references(() => users.id),
  ratedAt: text("rated_at"),
});

export const assets = sqliteTable("assets", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  assetCode: text("asset_code").notNull().unique(),
  name: text("name").notNull(),
  category: text("category"),
  purchaseDate: text("purchase_date"),
  status: text("status", { enum: ["available", "assigned", "retired"] }).notNull().default("available"),
});

export const assetAssignments = sqliteTable("asset_assignments", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  assetId: integer("asset_id").notNull().references(() => assets.id),
  employeeId: integer("employee_id").notNull().references(() => employees.id),
  assignedAt: text("assigned_at").notNull().default(sql`(current_timestamp)`),
  returnedAt: text("returned_at"),
  conditionNotes: text("condition_notes"),
});

export const policies = sqliteTable("policies", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  title: text("title").notNull(),
  content: text("content").notNull(),
  category: text("category"),
  version: integer("version").notNull().default(1),
  publishedAt: text("published_at").notNull().default(sql`(current_timestamp)`),
});

// Self-reported daily work log — the non-surveillance alternative to activity tracking:
// each employee logs what they worked on themselves, visible to their manager/HR/founder.
export const workLogEntries = sqliteTable("work_log_entries", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  employeeId: integer("employee_id").notNull().references(() => employees.id),
  date: text("date").notNull(),
  tasks: text("tasks").notNull(),
  createdAt: text("created_at").notNull().default(sql`(current_timestamp)`),
});

export const employeeQueries = sqliteTable("employee_queries", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  employeeId: integer("employee_id").notNull().references(() => employees.id),
  category: text("category").notNull(),
  subject: text("subject").notNull(),
  description: text("description"),
  status: text("status", { enum: ["open", "in_progress", "resolved", "closed"] }).notNull().default("open"),
  assignedToUserId: integer("assigned_to_user_id").references(() => users.id),
  resolvedAt: text("resolved_at"),
  createdAt: text("created_at").notNull().default(sql`(current_timestamp)`),
});
