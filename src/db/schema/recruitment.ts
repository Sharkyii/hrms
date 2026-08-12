import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";
import { employees, users } from "./core";

export const jobPostings = sqliteTable("job_postings", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  title: text("title").notNull(),
  department: text("department"),
  status: text("status", { enum: ["open", "on_hold", "closed"] }).notNull().default("open"),
  openings: integer("openings").notNull().default(1),
  description: text("description"),
  createdAt: text("created_at").notNull().default(sql`(current_timestamp)`),
});

export const candidates = sqliteTable("candidates", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  jobPostingId: integer("job_posting_id").notNull().references(() => jobPostings.id),
  name: text("name").notNull(),
  email: text("email").notNull(),
  phone: text("phone"),
  resumeUrl: text("resume_url"),
  source: text("source"),
  stage: text("stage", {
    enum: ["applied", "screening", "interview", "offer", "hired", "rejected"],
  }).notNull().default("applied"),
  createdAt: text("created_at").notNull().default(sql`(current_timestamp)`),
});

export const interviews = sqliteTable("interviews", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  candidateId: integer("candidate_id").notNull().references(() => candidates.id),
  round: integer("round").notNull().default(1),
  interviewerUserId: integer("interviewer_user_id").references(() => users.id),
  scheduledAt: text("scheduled_at"),
  feedback: text("feedback"),
  rating: real("rating"),
});

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
