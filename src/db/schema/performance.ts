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
  // Optional numeric Target-vs-Achieved tracking, alongside the free-text `target` hint above and
  // the subjective 1-5 rating in kraRatings. When targetValue is set, computeKpiScore derives a 0-100
  // score from targetValue/achievedValue instead of relying on a manually-typed rating — e.g. "Number
  // of Influencer Collaborations Completed: 4/month". Both scoring paths coexist; a goal uses whichever
  // it has data for.
  targetValue: real("target_value"),
  achievedValue: real("achieved_value"),
  targetUnit: text("target_unit", { enum: ["count", "percent", "currency_band"] }),
  // currency_band only: allowed +/- deviation from targetValue before score starts dropping, e.g. 5 for "+/-5%".
  bandPct: real("band_pct"),
  scoreOverride: real("score_override"),
});

// A reusable KPI checklist for a role (e.g. "Influencer Marketing Executive"), so HR can spin up a
// new hire's or a new cycle's goals in one click instead of retyping the same rows each time.
export const kpiTemplates = sqliteTable("kpi_templates", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  role: text("role").notNull(),
});

export const kpiTemplateItems = sqliteTable("kpi_template_items", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  templateId: integer("template_id").notNull().references(() => kpiTemplates.id),
  title: text("title").notNull(),
  weightPct: real("weight_pct").notNull(),
  targetValue: real("target_value"),
  targetUnit: text("target_unit", { enum: ["count", "percent", "currency_band"] }),
  bandPct: real("band_pct"),
  sortOrder: integer("sort_order").notNull().default(0),
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

// Peer-to-peer task board: any employee can assign a task to any other employee. The task
// itself (who/what/due date/status) is visible company-wide for coordination; the mentor's
// rating on it is visible only to the assignee, their manager, HR, and founder.
export const tasks = sqliteTable("tasks", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  title: text("title").notNull(),
  description: text("description"),
  assignedByEmployeeId: integer("assigned_by_employee_id").notNull().references(() => employees.id),
  assignedToEmployeeId: integer("assigned_to_employee_id").notNull().references(() => employees.id),
  dueDate: text("due_date"),
  status: text("status", { enum: ["open", "in_progress", "done"] }).notNull().default("open"),
  createdAt: text("created_at").notNull().default(sql`(current_timestamp)`),
  completedAt: text("completed_at"),
});

// One rating per task, given by the assignee's reporting manager (or HR/founder) once the task is done.
export const taskRatings = sqliteTable("task_ratings", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  taskId: integer("task_id").notNull().references(() => tasks.id).unique(),
  ratedByUserId: integer("rated_by_user_id").notNull().references(() => users.id),
  rating: real("rating").notNull(),
  comments: text("comments"),
  ratedAt: text("rated_at").notNull().default(sql`(current_timestamp)`),
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
